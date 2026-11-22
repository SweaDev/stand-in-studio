import '../../render/characters';
import { StudioEngine } from '../../core/StudioEngine';
import { SystemClock } from '../../core/util/Clock';
import type { FeedSource } from '../../render/StageCompositor';
import { APP_NAME } from '../../shared/app';
import type { StudioApi } from '../../shared/ipc';
import { type DeepPartial, type Settings, needsCardio, updateSettings } from '../../shared/settings';
import type { Mode, StageState } from '../../shared/types';
import { ConsentScreen, type ConsentChoice } from './components/ConsentScreen';
import { MODE_LABELS, ModeSwitch } from './components/ModeSwitch';
import { ModePanel } from './components/ModePanel';
import { HotkeyHelp, OverrideBar } from './components/Overrides';
import { ObsChecklist } from './components/ObsChecklist';
import { ApiKeyPanel } from './components/ApiKeyPanel';
import { StatusBanner } from './components/StatusBanner';
import { CalibrationWizard } from './components/CalibrationWizard';
import { PresetPanel } from './components/PresetPanel';
import { DEMO_CALIBRATION_MS } from './demo/DemoController';
import { CameraPicker } from './components/CameraPicker';
import { CameraManager } from './camera/CameraManager';
import { PresageSignalSource } from '../../sensing/presage/PresageSignalSource';
import { realSdkFactory } from './presage/sdkFactory';
import { type CaptureProfile, lowerProfile } from '../../shared/settings';
import { COMMANDS, type CommandName, type CommandReceiver } from '../../core/stage/commands';
import { nextMode } from '../../core/stage/ModeController';
import { PresenceDial } from './components/PresenceDial';
import { SettingsTabs } from './components/SettingsTabs';
import { CurrentIntentCard } from './components/CurrentIntentCard';
import { IntentList } from './components/IntentList';
import { AdvancedPanel } from './components/AdvancedPanel';
import { IntentBuilder } from './components/IntentBuilder';
import { GuidedTuning } from './components/GuidedTuning';
import { icon } from './icons';
import type { IntentDef } from '../../shared/intents';
import { DemoController } from './demo/DemoController';
import { h } from './dom';
import { StageHost } from './stage/StageHost';
import { StageLoop } from './stage/StageLoop';

/**
 * Mediator for the control window: owns the engine, the signal source (Demo or Presage),
 * the stage window and the UI components, and keeps settings in sync with main.
 */
export class ControlApp {
  readonly clock = new SystemClock();
  readonly engine: StudioEngine;
  readonly host = new StageHost();
  readonly loop: StageLoop;
  demo: DemoController | null = null;
  camera: CameraManager | null = null;
  presage: PresageSignalSource | null = null;
  readonly banner = new StatusBanner();
  private feed: () => FeedSource | null = () => null;
  private readonly frameListeners: ((s: StageState) => void)[] = [];
  readonly thumb: HTMLCanvasElement;
  readonly main: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    readonly api: StudioApi,
    private settings: Settings,
  ) {
    this.engine = new StudioEngine(settings, this.clock);
    this.thumb = h('canvas', {
      id: 'thumb',
      width: 960,
      height: 540,
      role: 'img',
      'aria-label': 'Live preview of what the meeting sees',
    });
    this.loop = new StageLoop(
      this.engine,
      this.host,
      () => this.feed(),
      this.thumb,
      (s) => this.frameListeners.forEach((fn) => fn(s)),
    );
    this.main = h('main', { class: 'workspace', hidden: true });
    // Hotkeys arrive from main; registered once for the app's lifetime.
    this.api.onCommand((c) => {
      if (!this.main.hidden) this.runCommand(c);
    });
    // Learned intent tuning: shown in the list, and saved only if the user opted in.
    this.engine.events.on('tuning', (t) => {
      if (t.phase !== 'done') return;
      this.intentList?.sync(this.settings.auto.intents, this.engine.intentTuning);
      if (this.settings.auto.saveTuning)
        void this.updateSettings({ intentTuning: { ...this.engine.intentTuning } });
    });
    // Main is quitting: stop the SDK from this side too, so no frames race the teardown.
    this.api.onQuitting(() => {
      this.loop.stop();
      void this.presage?.stop();
    });
  }

  /**
   * Camera and SDK transitions (restart, camera switch, low-frame-rate step-down) run one
   * at a time: a new SDK session is configured only after the previous one has fully
   * stopped and been destroyed. SDK state is process-global, so overlapping sessions are
   * unsafe.
   */
  private transitions: Promise<void> = Promise.resolve();

  private serial(fn: () => Promise<void>): Promise<void> {
    const run = this.transitions.then(async () => {
      this.setBusy(true);
      try {
        await fn();
      } finally {
        this.setBusy(false);
      }
    });
    this.transitions = run.catch(() => undefined);
    return run;
  }

  private setBusy(busy: boolean): void {
    this.root.toggleAttribute('aria-busy', busy);
    for (const el of this.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      '#stop-camera, #group-camera-device select, #group-camera-device button',
    ))
      el.disabled = busy;
  }

  get currentSettings(): Settings {
    return this.settings;
  }

  /** Registers a per-frame UI updater. */
  onFrame(fn: (s: StageState) => void): void {
    this.frameListeners.push(fn);
  }

  private panel: ModePanel | null = null;
  private presets: PresetPanel | null = null;
  private intentList: IntentList | null = null;
  private advanced: AdvancedPanel | null = null;
  tabs: SettingsTabs | null = null;

  /** Applies a settings change locally at once and persists it in main. */
  async updateSettings(patch: DeepPartial<Settings>): Promise<void> {
    this.settings = updateSettings(this.settings, patch);
    this.engine.applySettings(this.settings);
    this.panel?.sync(this.settings);
    this.presets?.sync(this.settings);
    this.advanced?.sync(this.settings);
    if (patch.auto?.intents) this.intentList?.sync(this.settings.auto.intents, this.engine.intentTuning);
    // Re-requests metrics only when cardio need changes (Comfort shield or a body-signal intent).
    void this.presage?.setComfortShield(needsCardio(this.settings));
    this.settings = await this.api.setSettings(patch);
  }

  async start(): Promise<void> {
    const key = await this.api.apiKeyStatus();
    const header = h(
      'header',
      { class: 'app-header' },
      h(
        'div',
        { class: 'brand' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
        h(
          'div',
          {},
          h('h1', {}, APP_NAME),
          h('p', { class: 'tagline' }, 'Decide how much of you each call sees'),
        ),
      ),
      h(
        'span',
        { class: 'demo-badge', id: 'demo-badge', role: 'status', hidden: true },
        'DEMO – simulated signals',
      ),
    );
    const consent = new ConsentScreen(
      {
        cameraAvailable: key.available && !this.api.info.forceDemo,
        openExternal: (u) => void this.api.openExternal(u),
      },
      (choice) => {
        consent.el.remove();
        void this.begin(choice);
      },
    );
    this.root.replaceChildren(header, consent.el, this.main);
    (consent.el.querySelector('button:not([disabled])') as HTMLButtonElement | null)?.focus();
  }

  /** Stops everything and returns to the consent screen (e.g. after adding a key). */
  restart(): Promise<void> {
    return this.serial(() => this.doRestart());
  }

  private async doRestart(): Promise<void> {
    this.loop.stop();
    await this.demo?.stop();
    this.demo = null;
    await this.presage?.stop();
    this.presage = null;
    this.camera?.close();
    this.camera = null;
    this.banner.hide();
    this.feed = () => null;
    this.host.close();
    this.frameListeners.length = 0;
    this.main.hidden = true;
    this.root.insertBefore(this.banner.el, this.main);
    this.main.replaceChildren();
    await this.start();
  }

  /** Runs after consent: starts signals, the stage window and the loop. */
  private async begin(choice: ConsentChoice): Promise<void> {
    if (choice === 'demo') {
      this.demo = new DemoController(this.engine, this.clock);
      this.feed = () => this.demo?.frame() ?? null;
      await this.demo.start();
      this.demo.bindKeys(window);
      (document.getElementById('demo-badge') as HTMLElement).hidden = false;
    } else if (!(await this.startCamera())) {
      return;
    }
    this.buildWorkspace();
    this.main.hidden = false;
    this.host.open();
    this.loop.start();
  }

  /** Runs a command from a hotkey or a button (Command pattern). */
  runCommand(name: CommandName): void {
    const receiver: CommandReceiver = {
      toggleHide: () => this.engine.toggleHide(),
      togglePin: () => this.engine.togglePin(),
      toggleRaiseHand: () => this.engine.toggleRaiseHand(),
      toggleBackSoon: () => this.engine.toggleBackSoon(),
      cycleMode: () => this.setMode(nextMode(this.engine.currentMode)),
    };
    COMMANDS[name].execute(receiver);
  }

  /** Mode switch: persists the choice. */
  setMode(mode: Mode): void {
    this.engine.setMode(mode);
    void this.updateSettings({ mode });
  }

  /** Turning the dial switches to Blend at that opacity (REQUIREMENT §2). */
  turnDial(v: number): void {
    this.engine.setDial(v);
    void this.updateSettings({ mode: 'blend', blend: { opacity: v } });
  }

  /**
   * Opens the physical camera once and gives the same stream to the SDK and the stage
   * (REQUIREMENT §7). Returns false (staying on the consent screen) if it fails.
   */
  private async startCamera(): Promise<boolean> {
    const cam = new CameraManager();
    let stream: MediaStream;
    try {
      stream = await cam.open(this.settings.camera.deviceId, this.settings.camera.profile);
    } catch (err) {
      this.root.insertBefore(this.banner.el, this.main);
      this.banner.show(`Could not open the camera: ${(err as Error).message}`, {
        label: 'Try Demo mode',
        run: () => {
          this.banner.hide();
          document.querySelector('.consent')?.remove();
          void this.begin('demo');
        },
      });
      return false;
    }
    this.camera = cam;
    if (cam.deviceId && cam.deviceId !== this.settings.camera.deviceId) {
      void this.updateSettings({ camera: { deviceId: cam.deviceId } });
    }
    this.feed = () => {
      const v = cam.element;
      return v && v.videoWidth > 0 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null;
    };
    this.presage = this.createPresage(stream);
    await this.presage.start();
    this.engine.startCalibration();
    return true;
  }

  private createPresage(stream: MediaStream): PresageSignalSource {
    const src = new PresageSignalSource(
      stream,
      { comfortShield: needsCardio(this.settings) },
      realSdkFactory,
      this.clock,
    );
    src.events.on('frame', (f) => this.engine.ingest(f));
    src.events.on('status', (st) => st === 'running' && this.banner.hide());
    src.events.on('error', (e) => {
      if (this.presage !== src) return; // a retired session's late error
      // Too few frames for the SDK: capture at the next lower resolution (REQUIREMENT §10).
      const lower = lowerProfile(this.settings.camera.profile);
      if (e.reason === 'lowFrameRate' && lower && this.camera) {
        this.banner.show(`${e.message} Switching the camera to ${lower.replace('x', '×')}.`);
        void this.switchCamera(this.camera.deviceId ?? '', lower);
        return;
      }
      this.banner.show(
        e.message,
        e.retrying ? undefined : { label: 'Continue in Demo mode', run: () => void this.restart() },
      );
    });
    return src;
  }

  /** Switches camera or resolution: reopens the stream and restarts sensing on it. */
  switchCamera(deviceId: string, profile: CaptureProfile): Promise<void> {
    return this.serial(() => this.doSwitchCamera(deviceId, profile));
  }

  private async doSwitchCamera(deviceId: string, profile: CaptureProfile): Promise<void> {
    if (!this.camera) return;
    await this.presage?.stop();
    this.presage = null;
    const stream = await this.camera.open(deviceId, profile);
    await this.updateSettings({ camera: { deviceId: this.camera.deviceId, profile } });
    this.presage = this.createPresage(stream);
    await this.presage.start();
  }

  private cameraGroup(): HTMLElement {
    const picker = new CameraPicker((id, profile) => void this.switchCamera(id, profile));
    void this.camera
      ?.list()
      .then((d) => picker.setDevices(d, this.camera?.deviceId ?? null, this.settings.camera.profile));
    return h('div', { class: 'group', id: 'group-camera-device' }, h('h3', {}, 'Camera'), picker.el);
  }

  /** Lays out the main workspace. */
  protected buildWorkspace(): void {
    const dial = new PresenceDial((v) => this.turnDial(v));
    this.presets = new PresetPanel(
      () => this.settings,
      (p) => void this.updateSettings(p),
    );
    const calibration = new CalibrationWizard(() =>
      this.engine.startCalibration(this.demo ? DEMO_CALIBRATION_MS : undefined),
    );
    this.onFrame(() => calibration.update(this.engine.calibrationStatus(), this.presage?.lastHint ?? ''));
    const overrides = new OverrideBar(this.api.info.platform, (c) => this.runCommand(c));
    const help = new HotkeyHelp(this.api.info.platform, this.demo !== null);
    const obs = new ObsChecklist(
      this.api.info.platform,
      (u) => void this.api.openExternal(u),
      (on) => this.engine.setTestPattern(on),
    );
    this.panel = new ModePanel(this.settings, {
      update: (p) => void this.updateSettings(p),
      setBlend: (v) => this.turnDial(v),
    });
    const modes = new ModeSwitch((m) => this.setMode(m));
    this.onFrame((s) => {
      dial.set(s.feedOpacity, MODE_LABELS[s.mode]);
      overrides.set(this.engine.overrideState);
      modes.set(s.mode);
    });
    const scriptBtn = h(
      'button',
      { type: 'button', id: 'script', 'aria-pressed': 'false' },
      'Play scripted meeting',
    );
    scriptBtn.addEventListener('click', () => {
      if (!this.demo) return;
      this.demo.toggleScript();
      scriptBtn.setAttribute('aria-pressed', String(this.demo.script.isRunning));
      scriptBtn.textContent = this.demo.script.isRunning ? 'Stop scripted meeting' : 'Play scripted meeting';
    });
    const caption = h('p', { class: 'caption', id: 'caption', 'aria-live': 'polite' });
    this.onFrame(() => {
      const text = this.demo?.script.caption ?? '';
      if (caption.textContent !== text) caption.textContent = text;
    });
    const builder = new IntentBuilder({
      intents: () => this.settings.auto.intents,
      save: (intents) => void this.updateSettings({ auto: { intents } }),
      liveContext: () => this.engine.signalContext,
      openExternal: (u) => void this.api.openExternal(u),
    });
    const guided = new GuidedTuning(this.engine, (id) =>
      this.settings.auto.intents.some((i) => i.id === id && i.enabled),
    );
    let frame = 0;
    this.onFrame(() => {
      guided.update();
      if (builder.isOpen && frame++ % 6 === 0) builder.live();
    });
    this.intentList = new IntentList({
      change: (intents: IntentDef[]) => void this.updateSettings({ auto: { intents } }),
      tune: (id) => this.engine.startTuning(id),
      edit: (id) => builder.open({ kind: 'edit', id }),
      duplicate: (id) => builder.open({ kind: 'duplicate', id }),
    });
    this.intentList.sync(this.settings.auto.intents, this.engine.intentTuning);
    this.advanced = new AdvancedPanel(this.settings, {
      update: (p) => void this.updateSettings(p),
      createIntent: () => builder.open({ kind: 'create' }),
      forgetTuning: () => {
        this.engine.clearTuning();
        this.intentList?.sync(this.settings.auto.intents, this.engine.intentTuning);
        void this.updateSettings({ intentTuning: {} });
      },
      openExternal: (u) => void this.api.openExternal(u),
    });
    const current = new CurrentIntentCard();
    this.onFrame((s) => {
      current.update(this.engine.debug, s.mode);
      this.intentList?.live(this.engine.debug?.intent.id ?? null, this.engine.tuningActive);
    });
    this.tabs = new SettingsTabs(
      [
        {
          id: 'auto',
          label: 'Auto',
          content: [
            current.el,
            this.panel.groups.auto,
            h(
              'div',
              { class: 'group', id: 'group-intents' },
              h(
                'div',
                { class: 'group-head' },
                h('h3', {}, 'Intents'),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn-small',
                    id: 'new-intent',
                    onclick: () => builder.open({ kind: 'create' }),
                  },
                  icon('plus', 14),
                  'New intent',
                ),
              ),
              this.intentList.el,
            ),
          ],
        },
        {
          id: 'stage',
          label: 'Stage',
          content: [
            this.panel.groups.character,
            this.panel.groups.blend,
            this.panel.groups.camera,
            this.panel.groups.a11y,
            this.presets.el,
          ],
        },
        {
          id: 'camera',
          label: 'Camera',
          content: [
            this.camera ? this.cameraGroup() : null,
            new ApiKeyPanel(this.api, this.demo === null, () => void this.restart()).el,
          ],
        },
        { id: 'advanced', label: 'Advanced', content: [this.advanced.el] },
      ],
      'auto',
    );
    this.root.insertBefore(this.banner.el, this.main);
    this.main.replaceChildren(
      h(
        'section',
        { class: 'controls card', 'aria-label': 'Presence' },
        dial.el,
        modes.el,
        calibration.el,
        guided.el,
      ),
      h(
        'section',
        { class: 'preview card', 'aria-label': 'What the meeting sees' },
        h('div', { class: 'thumb-frame' }, this.thumb, h('span', { class: 'thumb-label' }, 'Live stage')),
        h(
          'div',
          { class: 'row toolbar' },
          h(
            'button',
            { type: 'button', id: 'open-stage', onclick: () => this.host.open() },
            'Open stage window',
          ),
          this.demo ? scriptBtn : null,
          h('button', { type: 'button', id: 'show-help', onclick: () => help.open() }, 'Shortcuts'),
          this.camera
            ? h(
                'button',
                { type: 'button', id: 'stop-camera', onclick: () => void this.restart() },
                'Stop camera',
              )
            : null,
        ),
        caption,
        overrides.el,
        help.el,
        obs.el,
      ),
      h('section', { class: 'settings card', 'aria-label': 'Settings' }, this.tabs.el),
      builder.el,
    );
  }
}
