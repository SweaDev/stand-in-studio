# Stand-In Studio — Implementation Plan

## Context
The repo (`sweadev/stand-in-studio`) holds only `REQUIREMENT.md`, a stub README and a LICENSE. REQUIREMENT.md describes an Electron desktop app that uses the Presage SmartSpectra SDK (`@smartspectra/node-sdk`). Its main control is a **presence dial**: the stage the meeting sees runs from your real webcam to a hand-drawn character that mirrors your breathing, blinks, nods, talking and smiles. OBS Virtual Camera carries the stage to Zoom, Meet or Teams. The app is an entry for the DEV "Presage SmartSpectra SDK Challenge", due **2026-11-22 23:59 PST**, so core scope comes first and nice-to-haves can be cut.

The goal of this plan is that a fresh Claude session in auto mode can execute it task by task. It starts at the first unchecked box in `TASKS.md`, makes one small, runnable commit per task, and finishes with tag `v1.0.0`, a proper README.md and POST.md.

### Facts established during planning
- The SDK `@smartspectra/node-sdk@3.5.0` supports **linux-x64** (glibc ≥ 2.35), win32-x64 and darwin-arm64. It needs Node ≥ 20 and Electron ≥ 28. It is pure FFI with no rebuild step.
- SDK entry points:
  - `/main`: `bindSmartSpectraIpc(win)`
  - `/preload`: exposes `window.__smartspectraBridge`
  - `/renderer`: `SmartSpectraSDK`, `useMediaStream`, `start`/`stop`/`reset`/`destroy`, and the events `metrics(buf: Uint8Array)`, `validationStatus(code, ts, hint)`, `error(code, msg, retryable)` and `processingStatus`
  - `/messages`: `decodeMetrics`, `Metrics`
  - root: `MetricType`, `faceMetrics`, `breathingMetrics`, `cardioMetrics`, `ValidationCode`, `SmartSpectraErrorCode`
- The renderer bundle is browser-safe: it uses only constants, protobufjs and `MediaStreamTrackProcessor`. It needs `worker-src 'self' blob:` in the CSP.
- Decoded fields:
  - `breathing.upperTrace[]{value,stable,timestamp}`
  - `breathing.rate[]{value,confidence,stable}`
  - `cardio.pulseRate[]`
  - `face.blinking[]{detected,stable}` and `face.talking[]`
  - `face.landmarks[]{value:[{x,y}],stable,reset}`
  - `face.expression[]{scores:[{type,confidence 0–100}]}`
  - Expression enum: `HAPPY` and others.
- Validation codes: `kOk`=0, `kNoFaceFound`=1 and so on. Errors include `kAuthenticationFailed`=2, `kCreditExhausted`=4 and `kSustainedLowFrameRate`=14 (retryable for cameras).
- **API key flow:** the renderer SDK sends `options.apiKey` to main over the port in a `configure` message. Main builds the SDK with `new SmartSpectraSDK(sanitizeOptions(...))`, where `SmartSpectraSDK` is destructured from `../smartspectra` when `js/main/index.js` loads. So main can inject the key by replacing `SmartSpectraSDK` in that module's exports with a key-injecting subclass, *before* requiring `/main`. The module is loaded by absolute path because the package `exports` map blocks the subpath. The renderer then passes `apiKey: ''`. Pin the SDK to **exactly 3.5.0**, and add a test that fails if the internals change.
- **Landmark layout is undocumented.** The point count must be measured in the live spike. Supported layouts: 68 points (dlib) and 468/478 points (MediaPipe).
- **Environment:**
  - Ubuntu **24.04** container. This is the closest available to 26.04; note it in the README.
  - Node 22, `xvfb-run`, `ffmpeg` and Playwright Chromium are installed.
  - `PRESAGE_API_KEY` is set, and `physiology.presagetech.com` is reachable.
  - There is no physical webcam, so tests use Chromium's fake camera fed from a `.y4m` face clip.

### Decisions confirmed by the user
- **Test video:** use a CC-licensed Wikimedia Commons clip and **never commit it**. Record its exact source in `IMPLEMENTATION_NOTES.md`: URL, title, author, licence, download date, ffmpeg command and checksum. The same file logs every other environment or reproducibility step (budget usage per live run, perf measurements, deviations from this plan), so the process can be recreated later.
- **Scope:** nice-to-haves (Phase 8) come after all core work passes and before release. Cut them if time runs short.
- **Platforms:** cross-platform code for Linux, Windows and macOS. Testing is on Linux only, and the README says so, including Linux OBS/v4l2loopback notes.
- **Demo media:** commit generated Playwright screenshots and a short webm of Demo mode to `docs/media`. POST.md and the README carry a clearly marked placeholder for the user's real demo video.

## Ground rules
1. **Commits:**
   - Author: `git -c user.name="Fayaz Ahmed" -c user.email="me@fayaz.dev" commit -m "<one line>"`.
   - Single-line message only, with **no** Co-Authored-By or other trailers.
   - One task per commit. Every commit must build (`npm run build`) and pass `npm test` (lint, typecheck and unit tests).
2. **Push:** run `git push origin main` after each task. This is the user's explicit instruction, and it overrides the session branch. Push tags with `git push origin <tag>`. If the proxy refuses tag pushes (HTTP 403, as in cloud sessions), keep the annotated tag local and record it in the "Git tags" table in IMPLEMENTATION_NOTES.md.
3. **Tags:** create an annotated tag at the end of each phase, `v0.1.0` … `v0.9.0`, then `v1.0.0`. Bump `package.json` version in the same commit as the tag.
4. **TASKS.md:** tick the task's box in the *same* commit as the work.
5. **Presage budget:** at most **15 min (900 s)** of SDK session time in total.
   - All live runs go through `scripts/presage-budget.mjs`. It records start→stop seconds in the git-ignored `.presage-usage.json` and refuses to start a run that could exceed 900 s.
   - Planned use: probe 60 s, live e2e 120 s, final smoke 120 s. That is 300 s, leaving slack for debugging.
6. **Testing:** test on Linux only. Run headless Electron through `xvfb-run -a`.
7. **IMPLEMENTATION_NOTES.md:** add an entry for every reproducibility-relevant action: test-clip provenance, live-run budget usage, perf numbers, tool versions and plan deviations.
8. **Privacy:**
   - Never commit the key, test video or `.presage-usage.json`. Generated demo screenshots and webm in `docs/media` are fine to commit.
   - Never log physiological values outside debug output in tests.

## Architecture
The project is TypeScript with strict settings.
- **Build:** esbuild builds three bundles (main, preload, renderer), driven by `scripts/build.mjs`; `tsc --noEmit` does type checking.
- **Testing:** Vitest with fast-check for unit and property tests, and Playwright `_electron` for e2e.
- **Lint and format:** ESLint (flat config with typescript-eslint) and Prettier.

**Process model.** The main process holds windows, hotkeys, settings, the API key and the SDK IPC. All real-time work happens in **one renderer, the control window**:
- It opens the camera once with `getUserMedia`.
- It gives that same stream to the SDK with `sdk.useMediaStream(stream)`.
- It runs the engine and draws the stage.

The **Stage window** is opened with `window.open` from the control renderer. It is same-origin and same-process, frameless, 1280×720, and titled "Stand-In Stage". Main controls its window options through `setWindowOpenHandler`. As a result:
- the stage canvas draws the same `<video>` stream;
- the control window's thumbnail is just `drawImage(stageCanvas)`.

Set `backgroundThrottling:false` so a minimised control window doesn't throttle the stage. If this approach fails the T25 spike, the fallback is to move the engine into the stage window and send a thumbnail over IPC.

```
src/
  shared/      types.ts (SignalFrame, CharacterPose, StageState, Mode), settings.ts (defaults+validate), ipc.ts (channel names)
  core/        PURE: no Electron, no SDK, no DOM. Clock injected
    util/        Clock(+FakeClock), RingBuffer, percentile, Hysteresis, easing
    calibration/ Calibrator (State: idle→collecting→done) → Baseline
    features/    LandmarkLayout (Strategy: Dlib68 | MediaPipe468, detectLayout), headPose, mouthGap, eyeOpenness
    trackers/    BreathingNormalizer, BlinkDetector, GestureDetector(nod/shake), SmileDetector, TalkTracker, PresenceTracker
    pose/        PoseMapper (signals+baseline → CharacterPose; amplification ×3, reduced-motion ×0.5)
    auto/        rules.ts (Strategy list: TalkingRule, ListeningRule, LookAwayRule, EatingRule, FramingRule, NoFaceRule), AutoPolicy, ComfortShield
    stage/       OpacitySmoother (rate-limit 40%/s; eased cross-fade 300–600 ms), ModeController (State: Character/Camera/Blend/Auto), commands.ts (Command: HideMe, Pin, RaiseHand, BackSoon, CycleMode)
    StudioEngine.ts  Facade/Mediator: SignalSource → trackers → pose + auto → mode → smoother → StageState
  sensing/     SignalSource interface (Adapter)
    requestedMetrics.ts (settings → MetricType[]; cardio only if shield on)
    metricsMapper.ts (decoded Metrics → SignalFrame)
    PresageSignalSource.ts, DemoSignalSource.ts (keyboard), demoScript.ts (60 s loop), cameraFilter.ts (exclude OBS/virtual/loopback)
  render/      characters/Character.ts (interface draw(ctx, pose, style)), registry.ts (Factory/Registry), sketch.ts (seeded hand-drawn strokes),
               Lantern.ts, Houseplant.ts, Cat.ts, Cloud.ts; StageCompositor.ts (layers: bg → feed α + blur<30% → character → badges), badges.ts, testPattern.ts, sampleFeed.ts
  main/        main.ts, windows.ts, sdkKeyInjection.ts (Decorator subclass), apiKey.ts, settingsStore.ts, hotkeys.ts (globalShortcut → command IPC), permissions.ts
  preload/     control.ts (contextBridge `studio` API + require SDK preload)
  renderer/    control/ (index.html, app.ts, components: ConsentScreen, PresenceDial, ModeSwitch, ModePanel, CalibrationWizard, ObsChecklist, ApiKeyPanel, DemoBadge, HotkeyHelp), stage/ (stage.html, stage.ts)
tests/ unit (mirrors src), e2e (Playwright), live (budget-guarded)
scripts/ build.mjs, presage-budget.mjs, fetch-test-video.sh, live-probe.mjs, run-live.mjs
docs/ sdk-notes.md, media/ (screenshots)
```

**Design patterns:**
- Adapter: `SignalSource` for Presage or Demo.
- Strategy: landmark layouts, Auto rules and characters.
- State: modes, calibration and presence.
- Observer: a typed event emitter on the engine.
- Command: hotkeys and overrides.
- Factory/Registry: characters.
- Facade: `StudioEngine`.
- Decorator: the key-injecting SDK class.
- Dependency injection: `Clock`, so everything is deterministic under test.

**Key constants** (taken from REQUIREMENT.md; keep them in `core/constants.ts`):
- calibration 15 s
- breath normalisation over 15 s at p10–p90, scale 1±3.5%, idle breath 12/min after 2 s without data
- blink 140 ms with a 250 ms refractory period; landmark backup below 60% of calibrated openness
- nod or shake: a dip of ≥0.05 eye-distances that returns within 700 ms; ≥2 in 1.5 s counts as enthusiastic
- smile on at rest+0.25 held for 400 ms, off below rest+0.15
- away after 3 s, wake after 1 s
- talking counts after 1 s sustained
- look-away after 2 s
- eating (mouth open, not talking) after 1.5 s
- Auto hold 2 s, rate 40%/s
- Comfort shield: pulse +12 bpm or breathing +5/min triggers a cap of 15%, released after 20 s near baseline. Its baseline is the median of stable readings over the first ≥30 s after it is enabled, because cardio values average over many seconds.
- cross-fade 450 ms ease-in-out

**Auto invariant.** Enforced in `AutoPolicy` and property-tested with fast-check:
- The target is the minimum over all applicable rules.
- Only `TalkingRule` and `ListeningRule` may return a value above 0, and that value is capped by the user's `max`.
- Biometric and situational rules can only lower the target.
- *Hide me* forces 0% and *Pin* freezes the opacity.

## Verification strategy
- `npm test` runs lint, typecheck and Vitest. The pure core aims for ≥90% line coverage.
- `npm run test:e2e` runs `xvfb-run -a playwright test` on the Electron app in **Demo mode** with a fake camera. It checks consent gating, mode switching, the dial, hotkey commands (through the IPC test hook), and that the stage window title is "Stand-In Stage". It also takes a 320×180 snapshot of each character.
- `npm run test:live` runs Electron with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=test-assets/face.mjpeg` and the real SDK, with `PRESAGE_API_KEY` set. It is budget-guarded and capped at 120 s. It asserts that metrics events arrive, along with upperTrace samples, landmarks and validation `kOk`, and that the engine produces a pose.
  - The fake camera is enabled only when the env var `STANDIN_FAKE_CAMERA` is set.
  - The test video comes from `scripts/fetch-test-video.sh`. It downloads a CC-licensed talking-head clip from Wikimedia Commons, converts it with ffmpeg to 960×540, 30 fps, 60 s `.mjpeg` (for the fake camera) and `.mp4` (for the SDK file probe), and keeps it git-ignored.
  - Fallback: if no clip can be found, use any `STANDIN_FAKE_VIDEO` the user provides. If neither is available, verify only authentication and the `kNoFaceFound` validation on a synthetic clip, and document that.
- CI: a GitHub Actions workflow on ubuntu-24.04 runs `npm ci`, `npm test` and the e2e tests under xvfb. It never runs live tests.

## Task list
The ordered task list with progress checkboxes lives in [TASKS.md](TASKS.md).

## Critical files
- New: everything under `src/`, `tests/`, `scripts/`, `docs/`, plus `PLAN.md`, `TASKS.md`, `CLAUDE.md` and `.github/workflows/ci.yml`.
- Modified at the end: `README.md`. New: `POST.md` and `CHANGELOG.md`.
- SDK internals depended on (pinned to 3.5.0): `node_modules/@smartspectra/node-sdk/js/main/index.js` (`configure` → `new SmartSpectraSDK(sanitizeOptions(...))`) and `js/smartspectra.js` exports.

## Execution notes for auto mode
- T01 writes this plan as `PLAN.md`, with the Context, Ground rules, Architecture, constants and Verification sections, and the task list as `TASKS.md`.
- **Resume protocol** (top of TASKS.md):
  1. `git pull`
  2. `npm ci`
  3. `npm test`
  4. Do the first unchecked task.
  5. Tick its box in the same commit.
  6. Push to main.
  7. If it is a phase end, bump the version, tag and push the tag.
- When the SDK behaves differently from these notes, follow `docs/sdk-notes.md` (T06) and update PLAN.md in the same commit.
- Don't wait on the user. When something is ambiguous, pick the requirement-faithful default and note it in the commit's task line in TASKS.md.
