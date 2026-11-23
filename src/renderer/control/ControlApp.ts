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
import { type FakeSdkStats, createFakeSdkFactory } from './presage/fakeSdkFactory';
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
import { DecisionLog } from './components/DecisionLog';
import { icon } from './icons';
import type { IntentDef } from '../../shared/intents';
import { DemoController } from './demo/DemoController';
import { h } from './dom';
import { StageHost } from './stage/StageHost';
import { StageLoop } from './stage/StageLoop';
import { RecordedFeed } from './recorded/RecordedFeed';
import { TransportBar } from './recorded/TransportBar';
import { SaveDemoDialog } from './recorded/SaveDemoDialog';
import { ClipRecorder, MAX_RECORDING_MS } from './recorded/ClipRecorder';
import { DemoLibraryPanel } from './recorded/DemoLibraryPanel';
import { VirtualCameraFeed } from './vcam/VirtualCameraFeed';
import { VirtualCameraPanel } from './vcam/VirtualCameraPanel';
import type { VcamStatus } from '../../shared/vcam';
import { ReplaySignalSource } from '../../sensing/recorded/ReplaySignalSource';
import { TelemetryRecorder } from '../../sensing/recorded/TelemetryRecorder';
import { sanitizeTelemetry } from '../../shared/telemetry';
import { formatDuration, videoExt } from '../../shared/demos';
import { StatusBar } from './components/StatusBar';
import { type InputFacts, type InputSource, describeInput } from '../../shared/inputStatus';

/** Presage SDK version bundled with the app (stamped into saved telemetry). */
const SDK_VERSION = '3.5.0';

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
  /** A recorded clip in place of the camera (live analysis or saved-demo replay). */
  clip: RecordedFeed | null = null;
  /** Offline replay of a saved demo's telemetry (never uses the SDK). */
  replay: ReplaySignalSource | null = null;
  /** Name of the saved demo being replayed. */
  replayName = '';
  /** Telemetry being saved for the clip (one pass, start to end). */
  telemetry: TelemetryRecorder | null = null;
  private transport: TransportBar | null = null;
  readonly saveDialog = new SaveDemoDialog();
  private apiAvailable = false;
  private lastClipMs = 0;
  /** Privacy shutter: the webcam is released and only the character is shown. */
  cameraOff = false;
  /** The user turned Presage analysis off (until turned back on or the input changes). */
  presageOff = false;
  /** Name of the open (or last open) camera. */
  private cameraLabel = '';
  private statusBar: StatusBar | null = null;
  readonly banner = new StatusBanner();
  private feed: () => FeedSource | null = () => null;
  private readonly frameListeners: ((s: StageState) => void)[] = [];
  readonly thumb: HTMLCanvasElement;
  /** Small preview of the Virtual Stage output, inside the raw preview. */
  readonly inset: HTMLCanvasElement;
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
      'aria-label': 'Live input: your camera, clip or demo video as it comes in',
    });
    this.inset = h('canvas', { id: 'stage-inset', width: 320, height: 180, 'aria-hidden': 'true' });
    this.loop = new StageLoop(
      this.engine,
      this.host,
      () => this.feed(),
      { raw: this.thumb, inset: this.inset },
      (s) => this.frameListeners.forEach((fn) => fn(s)),
      () => this.beforeTick(),
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
      '#stop-camera, #pill-camera, #group-camera-device select, #group-camera-device button',
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
  private devlog: DecisionLog | null = null;
  tabs: SettingsTabs | null = null;

  /** How long the stage must stay in Camera mode before the SDK is paused (mode cycling). */
  static readonly PAUSE_DEBOUNCE_MS = 1_500;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Camera mode passes the webcam straight through, so the Presage SDK must not analyse
   * anything then: pause it after a short debounce on entering Camera mode, resume at once
   * on leaving it. Goes through the transition chain so it never races a restart.
   */
  private syncSensing(): void {
    // A saved-demo replay has no SDK: it simply stops feeding signals while the clip is paused.
    if (this.replay) {
      this.engine.setSensing(this.clip && !this.clip.playing ? 'paused' : 'live');
      return;
    }
    const src = this.presage;
    if (!src) return;
    if (this.wantsPause()) {
      if (src.isPaused) return;
      const pauseNow = () =>
        void this.serial(async () => {
          if (this.presage !== src || !this.wantsPause() || src.isPaused) return;
          this.engine.setSensing('paused');
          await src.pause();
        });
      // Turned off by the user: at once. Camera mode: after a debounce (mode cycling).
      if (this.presageOff) {
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        this.pauseTimer = undefined;
        pauseNow();
        return;
      }
      if (this.pauseTimer) return;
      this.pauseTimer = setTimeout(() => {
        this.pauseTimer = undefined;
        pauseNow();
      }, ControlApp.PAUSE_DEBOUNCE_MS);
      return;
    }
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = undefined;
    if (src.isPaused) {
      void this.serial(async () => {
        if (this.presage !== src || this.wantsPause() || !src.isPaused) return;
        this.engine.setSensing('live');
        await src.resume();
      });
    }
  }

  /** The SDK has nothing to do: turned off, Camera mode, or a recorded clip that is paused or over. */
  private wantsPause(): boolean {
    return (
      this.presageOff || this.engine.currentMode === 'camera' || (this.clip !== null && !this.clip.playing)
    );
  }

  /** Why the SDK is paused, for the status chip. */
  private pauseReason(): string {
    if (this.presageOff) return 'Presage off · turned off by you, nothing is analysed';
    if (this.engine.currentMode === 'camera')
      return this.clip
        ? 'Presage paused · the clip passes straight through'
        : 'Presage paused · your video passes straight through';
    return 'Presage paused · the clip is paused';
  }

  /** Every stage frame, before the engine ticks: replay frames, and clip jumps. */
  private beforeTick(): void {
    const clip = this.clip;
    if (!clip) return;
    const ms = clip.mediaMs;
    if (this.replay) {
      this.replay.sync(ms);
    } else if (ms + 250 < this.lastClipMs) {
      // Looped or seeked back: what the SDK saw before the jump no longer applies.
      this.engine.resetSignals();
    }
    this.lastClipMs = ms;
  }

  /** Starts sensing on a new source: paused from the outset when the stage is in Camera mode. */
  private async startSensing(src: PresageSignalSource): Promise<void> {
    const paused = this.engine.currentMode === 'camera' || this.presageOff;
    if (paused) this.engine.setSensing('paused');
    await src.start({ paused });
  }

  /** Applies a settings change locally at once and persists it in main. */
  async updateSettings(patch: DeepPartial<Settings>): Promise<void> {
    this.settings = updateSettings(this.settings, patch);
    this.engine.applySettings(this.settings);
    this.syncSensing();
    this.panel?.sync(this.settings);
    this.presets?.sync(this.settings);
    this.advanced?.sync(this.settings);
    this.devlog?.setEnabled(this.settings.advanced.developerMode);
    if (patch.auto?.intents) this.intentList?.sync(this.settings.auto.intents, this.engine.intentTuning);
    // Re-requests metrics only when cardio need changes (Comfort shield or a body-signal intent).
    void this.presage?.setComfortShield(needsCardio(this.settings));
    if (patch.background && this.vcamFeed && this.vcamStatus.state === 'live')
      this.api.vcam.setPausedFrame(this.vcamFeed.pausedFrame(this.settings.background));
    this.settings = await this.api.setSettings(patch);
  }

  async start(): Promise<void> {
    const key = await this.api.apiKeyStatus();
    this.apiAvailable = key.available && !this.api.info.forceDemo;
    const library = await this.api.demos.list().catch(() => null);
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
    );
    const consent = new ConsentScreen(
      {
        cameraAvailable: this.apiAvailable,
        openExternal: (u) => void this.api.openExternal(u),
        demos: library?.demos ?? [],
        lastDemo: this.settings.recorded.lastDemo,
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

  /** Replays a saved demo now (from the demo library), without going back to the start screen. */
  playDemo(id: string): Promise<void> {
    return this.serial(() => this.doRestart({ kind: 'replay', id }));
  }

  private async doRestart(next?: ConsentChoice): Promise<void> {
    await this.stopVcam().catch(() => undefined);
    this.vcamPanel = null;
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = undefined;
    this.engine.setSensing('live');
    this.engine.setCameraOff(false);
    this.cameraOff = false;
    this.presageOff = false;
    this.statusBar = null;
    this.loop.stop();
    await this.demo?.stop();
    this.demo = null;
    await this.presage?.stop();
    this.presage = null;
    this.telemetry?.abort('The camera was stopped.');
    this.recording?.stop();
    this.recording = null;
    this.camera?.close();
    this.camera = null;
    this.telemetry = null;
    await this.replay?.stop();
    this.replay = null;
    this.clip?.close();
    this.clip = null;
    this.transport = null;
    this.lastClipMs = 0;
    this.banner.hide();
    this.feed = () => null;
    this.host.close();
    this.frameListeners.length = 0;
    this.main.hidden = true;
    this.root.insertBefore(this.banner.el, this.main);
    this.main.replaceChildren();
    this.demoLibraryChanged = () => undefined;
    await this.start();
    if (next) {
      // Consent was already given this launch; a replay uses no camera and no API.
      document.querySelector('.consent')?.remove();
      await this.begin(next);
    }
  }

  /** Runs after consent: starts signals, the stage window and the loop. */
  private async begin(choice: ConsentChoice): Promise<void> {
    if (typeof choice === 'object') {
      if (!(await (choice.kind === 'clip' ? this.startClip(choice.file) : this.startReplay(choice.id))))
        return;
    } else if (choice === 'demo') {
      this.demo = new DemoController(this.engine, this.clock);
      this.feed = () => this.demo?.frame() ?? null;
      await this.demo.start();
      this.demo.bindKeys(window);
    } else if (!(await this.startCamera())) {
      return;
    }
    this.vcamStatus = await this.api.vcam.status().catch(() => ({ state: 'unsupported' }) as VcamStatus);
    this.buildWorkspace();
    this.main.hidden = false;
    this.host.open();
    this.loop.start();
    void this.syncVcam();
  }

  // ---------------------------------------------------------------- Stand-In Camera

  /** The native virtual camera's last known status ('unsupported' off Linux). */
  vcamStatus: VcamStatus = { state: 'unsupported' };
  vcamFeed: VirtualCameraFeed | null = null;
  private vcamPanel: VirtualCameraPanel | null = null;
  private vcamBusy = false;

  /**
   * Brings the Stand-In Camera in line with the setting: starts it when enabled and a
   * device is ready (it is the default on Linux), stops it otherwise. Setup is never run
   * without the user's click.
   */
  async syncVcam(): Promise<void> {
    if (this.vcamBusy || this.vcamStatus.state === 'unsupported') return;
    this.vcamBusy = true;
    try {
      const want = this.settings.virtualCamera.enabled && !this.main.hidden;
      const live = this.vcamStatus.state === 'live';
      if (want && !live) {
        this.vcamStatus = await this.api.vcam.status();
        if (this.vcamStatus.state === 'ready') {
          this.vcamFeed ??= new VirtualCameraFeed(this.api.vcam);
          this.api.vcam.setPausedFrame(this.vcamFeed.pausedFrame(this.settings.background));
          this.vcamStatus = await this.api.vcam.start();
          if (this.vcamStatus.state === 'live') {
            const feed = this.vcamFeed;
            feed.live = true;
            this.loop.output = (picture) => feed.push(picture);
          }
        }
      } else if (!want && live) {
        await this.stopVcam();
      }
    } finally {
      this.vcamBusy = false;
      this.vcamPanel?.update(this.vcamStatus, this.settings.virtualCamera.enabled);
      this.onVcamChange();
    }
  }

  private async stopVcam(): Promise<void> {
    this.loop.output = null;
    if (this.vcamFeed) this.vcamFeed.live = false;
    if (this.vcamStatus.state !== 'live') return;
    const paused = this.vcamFeed?.pausedFrame(this.settings.background);
    this.vcamStatus = await this.api.vcam.stop(paused);
  }

  /** One-time setup (the system asks for the password), then start if it worked. */
  async setupVcam(): Promise<void> {
    this.vcamPanel?.setBusy(true);
    this.vcamPanel?.say('');
    try {
      const r = await this.api.vcam.setup();
      this.vcamStatus = r.status;
      if (r.ok) this.vcamPanel?.say('Stand-In Camera is set up. Pick it in your meeting app.', 'ok');
      else if (r.reason === 'cancelled')
        this.vcamPanel?.say('Setup was cancelled. OBS and screen sharing below still work.', '');
      else if (r.reason !== 'notInstalled') this.vcamPanel?.say(r.message ?? 'Setup failed.', 'error');
    } finally {
      this.vcamPanel?.setBusy(false);
    }
    await this.syncVcam();
  }

  private onVcamChange: () => void = () => undefined;

  private vcamSection(): HTMLElement | null {
    if (this.vcamStatus.state === 'unsupported') return null;
    this.vcamPanel = new VirtualCameraPanel(this.settings.virtualCamera.enabled, {
      setEnabled: (on) =>
        void this.updateSettings({ virtualCamera: { enabled: on } }).then(() => this.syncVcam()),
      setup: () => void this.setupVcam(),
    });
    this.vcamPanel.onRecheck(() => {
      void this.api.vcam.status().then((st) => {
        this.vcamStatus = st;
        return this.syncVcam();
      });
    });
    this.vcamPanel.update(this.vcamStatus, this.settings.virtualCamera.enabled);
    return this.vcamPanel.el;
  }

  // ---------------------------------------------------------------- input status and toggles

  /** What feeds the stage and Presage right now. */
  private inputSource(): InputSource {
    if (this.replay) return 'replay';
    if (this.clip) return 'clip';
    if (this.demo) return 'demo';
    return 'camera';
  }

  /** Facts for the status bar and the Camera tab readout. */
  inputFacts(): InputFacts {
    const source = this.inputSource();
    const status = this.presage?.status ?? null;
    return {
      source,
      name:
        source === 'replay'
          ? this.replayName
          : source === 'clip'
            ? (this.clip?.name ?? '')
            : source === 'camera'
              ? this.cameraLabel
              : '',
      shutter: this.cameraOff,
      presage: status,
      pause:
        status !== 'paused'
          ? null
          : this.presageOff
            ? 'user'
            : this.engine.currentMode === 'camera'
              ? 'cameraMode'
              : 'clipPaused',
      apiKey: this.apiAvailable,
    };
  }

  /** Turns Presage analysis off (nothing is sent to it) or back on. */
  setPresageOff(off: boolean): void {
    if (off === this.presageOff) return;
    this.presageOff = off;
    this.syncSensing();
  }

  /**
   * Privacy shutter: turning the camera off releases the webcam and stops Presage, and the
   * stage shows only the character. Turning it on reopens the same camera.
   */
  setCameraOff(off: boolean): Promise<void> {
    return this.serial(async () => {
      const cam = this.camera;
      if (!cam || off === this.cameraOff) return;
      if (off) {
        this.telemetry?.abort('The camera was turned off.');
        this.recording?.stop();
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        this.pauseTimer = undefined;
        this.cameraOff = true;
        this.engine.setCameraOff(true);
        this.engine.setSensing('paused');
        await this.presage?.stop();
        this.presage = null;
        cam.close();
        return;
      }
      let stream: MediaStream;
      try {
        stream = await cam.open(this.settings.camera.deviceId, this.settings.camera.profile);
      } catch (err) {
        this.banner.show(`Could not turn the camera back on: ${(err as Error).message}`);
        return;
      }
      this.cameraLabel = cam.label;
      this.cameraOff = false;
      this.engine.setCameraOff(false);
      this.engine.setSensing('live');
      this.presage = this.createPresage(stream);
      await this.startSensing(this.presage);
    });
  }

  /** The header status bar (input, camera, Presage, Stand-In Camera). */
  private buildStatusBar(): StatusBar {
    const bar = new StatusBar({
      showInput: () => {
        this.tabs?.select('camera', true);
        this.tabs?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
      setCameraOff: (o) => void this.setCameraOff(o),
      setPresageOff: (o) => this.setPresageOff(o),
      setVcam: (on) => {
        const st = this.vcamStatus.state;
        if (st === 'ready' || st === 'live') {
          this.vcamPanel?.setEnabled(on);
          void this.updateSettings({ virtualCamera: { enabled: on } }).then(() => this.syncVcam());
        } else {
          document.getElementById('vcam')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      },
    });
    this.onFrame(() =>
      bar.update(describeInput(this.inputFacts()), this.camera !== null, {
        state: this.vcamStatus.state,
        enabled: this.settings.virtualCamera.enabled,
      }),
    );
    document.querySelector('.app-header')?.append(bar.el);
    this.statusBar = bar;
    return bar;
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

  /** Shows an error on the start screen with a way back to it. */
  private startFailed(message: string): false {
    this.root.insertBefore(this.banner.el, this.main);
    this.banner.show(message, { label: 'Back', run: () => void this.restart() });
    return false;
  }

  /**
   * A video file in place of the camera. With an API key the SDK analyses the clip exactly
   * as it would the webcam (so its telemetry can be saved); without one it only plays.
   */
  private async startClip(file: File): Promise<boolean> {
    const ext = videoExt(file.name);
    if (!ext) return this.startFailed('Choose a WebM, MP4, MOV, MKV or OGV video.');
    let clip: RecordedFeed;
    try {
      clip = await RecordedFeed.open(file, file.name, ext);
    } catch (err) {
      return this.startFailed((err as Error).message);
    }
    this.clip = clip;
    clip.onPlayState(() => this.syncSensing());
    this.feed = () => clip.feed();
    await clip.play().catch(() => undefined);
    if (this.apiAvailable) {
      this.presage = this.createPresage(clip.stream());
      this.engine.startCalibration();
      await this.startSensing(this.presage);
    }
    return true;
  }

  /** A saved demo: the clip plays and its saved telemetry drives the engine. No SDK, no API. */
  private async startReplay(id: string): Promise<boolean> {
    try {
      const demo = await this.api.demos.load(id);
      const telemetry = sanitizeTelemetry(demo.telemetry);
      const ext = demo.summary.videoFile.split('.').pop() ?? 'webm';
      const clip = await RecordedFeed.open(
        new Blob([demo.video as BlobPart], { type: demo.mime }),
        demo.summary.name,
        ext,
      );
      this.clip = clip;
      this.replayName = demo.summary.name;
      this.replay = new ReplaySignalSource(telemetry, this.clock, () => this.engine.resetSignals());
      this.replay.events.on('frame', (f) => this.engine.ingest(f));
      clip.onPlayState(() => this.syncSensing());
      this.feed = () => clip.feed();
      await this.replay.start();
      this.engine.startCalibration();
      await clip.play().catch(() => undefined);
      void this.updateSettings({ recorded: { lastDemo: id } });
      return true;
    } catch (err) {
      this.clip?.close();
      this.clip = null;
      this.replay = null;
      return this.startFailed(`Could not open the saved demo: ${(err as Error).message}`);
    }
  }

  /**
   * Saves telemetry for the open clip: asks first (privacy notice, name, body opt-in), then
   * plays the clip once from the start with the SDK analysing it, and stores the clip and
   * the signals in the demo library.
   */
  async saveClipTelemetry(): Promise<void> {
    const clip = this.clip;
    const src = this.presage;
    if (!clip || !src || this.replay || this.telemetry) return;
    const listing = await this.api.demos.list().catch(() => null);
    const choice = await this.saveDialog.ask({
      title: 'Save telemetry for this clip',
      action: 'Play and save',
      name: clip.name.replace(/\.[^.]+$/, ''),
      folder: listing?.dir ?? 'your demo library',
      includeBody: this.settings.recorded.saveBody,
    });
    if (!choice || this.clip !== clip) return;
    void this.updateSettings({ recorded: { saveBody: choice.includeBody } });
    if (this.engine.currentMode === 'camera') this.setMode('auto');
    if (this.presageOff) this.setPresageOff(false);
    if (choice.includeBody) await src.setComfortShield(true);
    const rec = new TelemetryRecorder({ mediaTime: () => clip.mediaMs, includeBody: choice.includeBody });
    const wasLooping = clip.loop;
    clip.pause();
    clip.loop = false;
    clip.seek(0);
    this.lastClipMs = 0;
    this.engine.resetSignals();
    this.telemetry = rec;
    this.transport?.lock(true);
    this.setTelemetryStatus('Saving telemetry: the clip plays once from the start…', true);
    try {
      await clip.play();
      await new Promise<void>((resolve) => {
        const check = () => {
          if (
            !clip.playing ||
            rec.aborted ||
            this.telemetry !== rec ||
            this.engine.currentMode === 'camera' ||
            this.presageOff
          ) {
            if (this.engine.currentMode === 'camera')
              rec.abort('Camera mode paused Presage, so the telemetry is incomplete.');
            if (this.presageOff) rec.abort('Presage was turned off, so the telemetry is incomplete.');
            if (!clip.video.ended && !rec.aborted) rec.abort('Saving was cancelled.');
            resolve();
          } else setTimeout(check, 100);
        };
        check();
      });
      const file = rec.finish({
        app: this.api.info.version,
        sdk: SDK_VERSION,
        video: {
          file: clip.name,
          durationMs: Math.round(clip.durationMs),
          width: clip.width,
          height: clip.height,
        },
      });
      const saved = await this.api.demos.save({
        name: choice.name,
        telemetry: file,
        video: await clip.bytes(),
        ext: clip.ext,
      });
      this.setTelemetryStatus(
        `Saved “${saved.name}” (${formatDuration(saved.durationMs)}, ${saved.frames} frames) to your demo library. Pick it under Demo mode on the start screen.`,
        false,
        'ok',
      );
      void this.updateSettings({ recorded: { lastDemo: saved.id } });
      this.demoLibraryChanged();
    } catch (err) {
      this.setTelemetryStatus(`Telemetry not saved: ${(err as Error).message}`, false, 'error');
    } finally {
      if (this.telemetry === rec) this.telemetry = null;
      clip.loop = wasLooping;
      this.transport?.lock(false);
      void src.setComfortShield(needsCardio(this.settings));
    }
  }

  /** The in-app camera recording in progress. */
  private recording: { clip: ClipRecorder; startedAt: number; stop: () => void } | null = null;

  /**
   * Records a demo with the camera: asks first (privacy notice, name, body opt-in), then
   * records the camera to WebM while Presage analyses it live, stamping the telemetry with
   * the recording's elapsed time, and saves both to the demo library on Stop.
   */
  async recordDemo(): Promise<void> {
    const cam = this.camera;
    const src = this.presage;
    const stream = cam?.current;
    if (this.recording) {
      this.recording.stop();
      return;
    }
    if (!cam || !src || !stream || this.telemetry) return;
    const listing = await this.api.demos.list().catch(() => null);
    const choice = await this.saveDialog.ask({
      title: 'Record a demo with your camera',
      action: 'Start recording',
      name: `Camera demo ${new Date().toLocaleString()}`,
      folder: listing?.dir ?? 'your demo library',
      includeBody: this.settings.recorded.saveBody,
    });
    if (!choice || this.camera !== cam || this.cameraOff) return;
    void this.updateSettings({ recorded: { saveBody: choice.includeBody } });
    if (this.engine.currentMode === 'camera') this.setMode('auto');
    if (this.presageOff) this.setPresageOff(false);
    if (choice.includeBody) await src.setComfortShield(true);
    let clip: ClipRecorder;
    try {
      clip = new ClipRecorder(stream);
    } catch (err) {
      this.setRecordStatus(`Recording is not available: ${(err as Error).message}`, 'error');
      return;
    }
    const startedAt = this.clock.now();
    const rec = new TelemetryRecorder({
      mediaTime: () => this.clock.now() - startedAt,
      includeBody: choice.includeBody,
    });
    let stopRequested: () => void = () => undefined;
    const stopped = new Promise<void>((resolve) => (stopRequested = resolve));
    this.recording = { clip, startedAt, stop: () => stopRequested() };
    this.telemetry = rec;
    clip.start();
    const limit = setTimeout(() => stopRequested(), MAX_RECORDING_MS);
    try {
      await stopped;
      clearTimeout(limit);
      const blob = await clip.stop();
      const durationMs = Math.round(this.clock.now() - startedAt);
      const s = cam.settings();
      const file = rec.finish({
        app: this.api.info.version,
        sdk: SDK_VERSION,
        video: { file: 'camera.webm', durationMs, width: s?.width ?? 0, height: s?.height ?? 0 },
      });
      const saved = await this.api.demos.save({
        name: choice.name,
        telemetry: file,
        video: new Uint8Array(await blob.arrayBuffer()),
        ext: 'webm',
      });
      this.setRecordStatus(
        `Saved “${saved.name}” (${formatDuration(saved.durationMs)}, ${saved.frames} frames) to your demo library.`,
        'ok',
      );
      void this.updateSettings({ recorded: { lastDemo: saved.id } });
      this.demoLibraryChanged();
    } catch (err) {
      void clip.stop().catch(() => undefined);
      this.setRecordStatus(`Demo not saved: ${(err as Error).message}`, 'error');
    } finally {
      clearTimeout(limit);
      if (this.telemetry === rec) this.telemetry = null;
      this.recording = null;
      void src.setComfortShield(needsCardio(this.settings));
    }
  }

  private recordStatus: HTMLElement | null = null;

  private setRecordStatus(text: string, tone: 'ok' | 'error' | '' = ''): void {
    if (!this.recordStatus) return;
    this.recordStatus.textContent = text;
    this.recordStatus.className = `telemetry-status${tone ? ` is-${tone}` : ''}`;
  }

  /** Camera tab: record a demo clip with its telemetry. */
  private recordGroup(): HTMLElement {
    const btn = h('button', { type: 'button', id: 'record-demo', onclick: () => void this.recordDemo() });
    this.recordStatus = h('p', { class: 'telemetry-status', id: 'record-status', role: 'status' });
    let wasRecording: boolean | null = null;
    this.onFrame(() => {
      const r = this.recording;
      if (r) {
        // Camera mode pauses Presage, which would leave a gap in the telemetry.
        if (this.engine.currentMode === 'camera' || this.presageOff) {
          this.telemetry?.abort(
            this.presageOff
              ? 'Presage was turned off, so the telemetry is incomplete.'
              : 'Camera mode paused Presage, so the telemetry is incomplete.',
          );
          r.stop();
        }
        this.setRecordStatus(
          `Recording · ${formatDuration(this.clock.now() - r.startedAt)} · ${this.telemetry?.count ?? 0} frames`,
        );
      }
      if (wasRecording === (r !== null)) return;
      wasRecording = r !== null;
      btn.replaceChildren(
        r ? h('span', { class: 'recording-dot', 'aria-hidden': 'true' }) : icon('record', 16),
        r ? 'Stop and save' : 'Record a demo…',
      );
      btn.classList.toggle('danger', r !== null);
    });
    return h(
      'div',
      { class: 'group', id: 'group-record-demo' },
      h('h3', {}, 'Record a demo'),
      h(
        'p',
        { class: 'hint' },
        'Records your camera together with the signals Presage reads from it. Saved demos replay offline (no API use) from the start screen, so you can test and tune intents on the same footage again and again.',
      ),
      btn,
      this.recordStatus,
    );
  }

  /** Cancels a telemetry save in progress. */
  cancelClipTelemetry(): void {
    this.telemetry?.abort('Saving was cancelled.');
  }

  private telemetryStatus: HTMLElement | null = null;
  private telemetryCancel: HTMLButtonElement | null = null;

  private setTelemetryStatus(text: string, busy: boolean, tone: 'ok' | 'error' | '' = ''): void {
    if (!this.telemetryStatus) return;
    this.telemetryStatus.textContent = text;
    this.telemetryStatus.className = `telemetry-status${tone ? ` is-${tone}` : ''}`;
    if (this.telemetryCancel) this.telemetryCancel.hidden = !busy;
  }

  /** Hook for the Advanced demo-library panel (refreshes its list). */
  private demoLibraryChanged: () => void = () => undefined;

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
    this.cameraLabel = cam.label;
    if (cam.deviceId && cam.deviceId !== this.settings.camera.deviceId) {
      void this.updateSettings({ camera: { deviceId: cam.deviceId } });
    }
    this.feed = () => {
      const v = cam.element;
      return v && v.videoWidth > 0 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null;
    };
    this.presage = this.createPresage(stream);
    this.engine.startCalibration();
    // In Camera mode the SDK is configured but never started (calibration waits for it).
    await this.startSensing(this.presage);
    return true;
  }

  /** E2E: counters of the fake SDK (STANDIN_FAKE_SDK=1). */
  readonly fakeSdk: FakeSdkStats = { created: 0, starts: 0, stops: 0, running: false, reports: 0 };

  private sdkFactory() {
    return this.api.info.e2e && this.api.info.fakeSdk ? createFakeSdkFactory(this.fakeSdk) : realSdkFactory;
  }

  private createPresage(stream: MediaStream): PresageSignalSource {
    const src = new PresageSignalSource(
      stream,
      { comfortShield: needsCardio(this.settings) },
      this.sdkFactory(),
      this.clock,
    );
    src.events.on('frame', (f) => {
      this.engine.ingest(f);
      this.telemetry?.push(f);
    });
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
    this.cameraLabel = this.camera.label;
    await this.updateSettings({ camera: { deviceId: this.camera.deviceId, profile } });
    this.presage = this.createPresage(stream);
    await this.startSensing(this.presage);
  }

  private cameraGroup(): HTMLElement {
    const picker = new CameraPicker((id, profile) => void this.switchCamera(id, profile));
    void this.camera
      ?.list()
      .then((d) => picker.setDevices(d, this.camera?.deviceId ?? null, this.settings.camera.profile));
    return h('div', { class: 'group', id: 'group-camera-device' }, h('h3', {}, 'Camera'), picker.el);
  }

  /** Covers the raw preview while the camera is off. */
  private cameraOffOverlay(): HTMLElement | null {
    if (!this.camera) return null;
    const on = h(
      'button',
      { type: 'button', class: 'primary', id: 'camera-on', onclick: () => void this.setCameraOff(false) },
      icon('camera', 16),
      'Turn camera on',
    );
    const el = h(
      'div',
      { class: 'camera-off', id: 'camera-off', hidden: true },
      icon('cameraOff', 32),
      h('strong', {}, 'Camera off'),
      h('span', {}, 'Your webcam is released. The meeting sees only your character.'),
      on,
    );
    this.onFrame(() => {
      if (el.hidden === this.cameraOff) el.hidden = !this.cameraOff;
    });
    return el;
  }

  /** What feeds the stage: shown on the raw preview. */
  private sourceLabel(): string {
    if (this.replay) return 'saved demo';
    if (this.clip) return 'recorded clip';
    if (this.demo) return 'simulated demo';
    return 'camera';
  }

  /** Transport for a recorded clip, plus Save telemetry when Presage analyses it. */
  private buildTransport(clip: RecordedFeed): TransportBar {
    const extra: HTMLElement[] = [];
    if (this.presage) {
      const save = h(
        'button',
        {
          type: 'button',
          class: 'btn-small',
          id: 'save-telemetry',
          onclick: () => void this.saveClipTelemetry(),
        },
        icon('record', 14),
        'Save telemetry…',
      );
      this.onFrame(() => {
        const busy = this.telemetry !== null;
        if (save.disabled !== busy) save.disabled = busy;
        if (busy && this.telemetry) {
          const rec = this.telemetry;
          this.setTelemetryStatus(
            `Saving telemetry · ${formatDuration(rec.progressMs)} / ${formatDuration(clip.durationMs)} · ${rec.count} frames`,
            true,
          );
        }
      });
      this.telemetryCancel = h(
        'button',
        {
          type: 'button',
          class: 'btn-small',
          id: 'cancel-telemetry',
          hidden: true,
          onclick: () => this.cancelClipTelemetry(),
        },
        'Cancel',
      );
      extra.push(save, this.telemetryCancel);
    }
    const bar = new TransportBar(clip, extra);
    this.telemetryStatus = h('p', { class: 'telemetry-status', id: 'telemetry-status', role: 'status' });
    bar.el.append(this.telemetryStatus);
    return bar;
  }

  /** Lays out the main workspace. */
  protected buildWorkspace(): void {
    this.buildStatusBar();
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
      this.vcamSection(),
    );
    // OBS becomes the optional alternative once the Stand-In Camera is live.
    let obsFolded: boolean | null = null;
    this.onVcamChange = () => {
      const live = this.vcamStatus.state === 'live';
      if (live !== obsFolded) {
        obsFolded = live;
        obs.obsDetails.open = !live;
      }
    };
    this.panel = new ModePanel(this.settings, {
      update: (p) => void this.updateSettings(p),
      setBlend: (v) => this.turnDial(v),
    });
    const modes = new ModeSwitch((m) => this.setMode(m));
    const sensingChip = h(
      'p',
      { class: 'sensing-chip', id: 'sensing-status', role: 'status', hidden: true },
      'Presage paused · your video passes straight through',
    );
    this.onFrame(() => {
      const paused = this.presage?.status === 'paused';
      const text = this.replay
        ? 'Replaying saved telemetry · no API'
        : paused
          ? this.pauseReason()
          : this.clip && !this.presage
            ? 'No API key · the clip plays without analysis'
            : '';
      if (sensingChip.textContent !== text) sensingChip.textContent = text;
      if (sensingChip.hidden !== (text === '')) sensingChip.hidden = text === '';
    });
    this.transport = this.clip ? this.buildTransport(this.clip) : null;
    // The Virtual Stage is frameless (clean OBS capture), so it is opened and closed here.
    const stageBtn = h('button', {
      type: 'button',
      id: 'open-stage',
      onclick: () => (this.host.isOpen ? this.host.close() : this.host.open()),
    });
    let stageOpen: boolean | null = null;
    this.onFrame(() => {
      const open = this.host.isOpen;
      if (open === stageOpen) return;
      stageOpen = open;
      stageBtn.textContent = open ? 'Close Virtual Stage Window' : 'Open Virtual Stage Window';
    });
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
    this.devlog = new DecisionLog();
    this.devlog.setEnabled(this.settings.advanced.developerMode);
    let frame = 0;
    this.onFrame(() => {
      this.devlog?.push(this.engine.debug?.trace);
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
    const library = new DemoLibraryPanel(this.api.demos, { play: (id) => void this.playDemo(id) });
    this.demoLibraryChanged = () => void library.refresh();
    const current = new CurrentIntentCard();
    this.onFrame((s) => {
      current.update(
        this.engine.debug,
        s.mode,
        this.cameraOff
          ? 'The camera is off: only your character is shown, and nothing is analysed.'
          : this.presageOff
            ? 'Presage is off: nothing is analysed, and Auto holds the current level.'
            : undefined,
      );
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
            this.camera && this.presage ? this.recordGroup() : null,
            new ApiKeyPanel(this.api, this.demo === null && this.replay === null, () => void this.restart())
              .el,
          ],
        },
        { id: 'advanced', label: 'Advanced', content: [this.advanced.el, library.el] },
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
        sensingChip,
        calibration.el,
        guided.el,
      ),
      h(
        'section',
        { class: 'preview card', 'aria-label': 'Live input and Virtual Stage' },
        h(
          'div',
          { class: 'thumb-frame' },
          this.thumb,
          h('span', { class: 'thumb-label' }, `Live input · ${this.sourceLabel()}`),
          this.cameraOffOverlay(),
          h(
            'button',
            {
              type: 'button',
              class: 'stage-inset',
              id: 'stage-inset-btn',
              title: 'Open the Virtual Stage window',
              'aria-label': 'Virtual Stage output: open or focus the Virtual Stage window',
              onclick: () => this.host.open(),
            },
            this.inset,
            h('span', { class: 'stage-inset-label' }, 'Virtual Stage'),
          ),
        ),
        h(
          'div',
          { class: 'row toolbar' },
          stageBtn,
          this.demo ? scriptBtn : null,
          h('button', { type: 'button', id: 'show-help', onclick: () => help.open() }, 'Shortcuts'),
          this.camera
            ? h(
                'button',
                { type: 'button', id: 'stop-camera', onclick: () => void this.restart() },
                'Stop camera',
              )
            : null,
          this.clip
            ? h(
                'button',
                { type: 'button', id: 'close-clip', onclick: () => void this.restart() },
                this.replay ? 'Close demo' : 'Close clip',
              )
            : null,
        ),
        this.transport?.el ?? null,
        caption,
        overrides.el,
        help.el,
        obs.el,
      ),
      h('section', { class: 'settings card', 'aria-label': 'Settings' }, this.tabs.el),
      this.devlog.el,
      builder.el,
      this.saveDialog.el,
    );
  }
}
