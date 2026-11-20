import '../../render/characters';
import { StudioEngine } from '../../core/StudioEngine';
import { SystemClock } from '../../core/util/Clock';
import type { FeedSource } from '../../render/StageCompositor';
import { APP_NAME } from '../../shared/app';
import type { StudioApi } from '../../shared/ipc';
import { type DeepPartial, type Settings, updateSettings } from '../../shared/settings';
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
      width: 480,
      height: 270,
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

  /** Applies a settings change locally at once and persists it in main. */
  async updateSettings(patch: DeepPartial<Settings>): Promise<void> {
    this.settings = updateSettings(this.settings, patch);
    this.engine.applySettings(this.settings);
    this.panel?.sync(this.settings);
    this.presets?.sync(this.settings);
    if (patch.auto?.comfortShield !== undefined)
      void this.presage?.setComfortShield(this.settings.auto.comfortShield);
    this.settings = await this.api.setSettings(patch);
  }

  async start(): Promise<void> {
    const key = await this.api.apiKeyStatus();
    const header = h(
      'header',
      { class: 'app-header' },
      h('h1', {}, APP_NAME),
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
  async restart(): Promise<void> {
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
      { comfortShield: this.settings.auto.comfortShield },
      realSdkFactory,
      this.clock,
    );
    src.events.on('frame', (f) => this.engine.ingest(f));
    src.events.on('status', (st) => st === 'running' && this.banner.hide());
    src.events.on('error', (e) => {
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
  async switchCamera(deviceId: string, profile: CaptureProfile): Promise<void> {
    if (!this.camera) return;
    await this.presage?.stop();
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
    this.root.insertBefore(this.banner.el, this.main);
    this.main.replaceChildren(
      h('section', { class: 'controls', 'aria-label': 'Presence' }, dial.el, modes.el, calibration.el),
      h(
        'section',
        { class: 'preview', 'aria-label': 'What the meeting sees' },
        this.thumb,
        h(
          'div',
          { class: 'row' },
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
      h(
        'section',
        { class: 'settings', 'aria-label': 'Settings' },
        this.panel.el,
        this.presets.el,
        this.camera ? this.cameraGroup() : null,
        new ApiKeyPanel(this.api, this.demo === null, () => void this.restart()).el,
      ),
    );
  }
}
