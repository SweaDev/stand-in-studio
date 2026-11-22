# Stand-In Studio — Tasks

Progress tracker for [PLAN.md](PLAN.md). One task = one commit; tick the box in the same commit as the work.

## Resume protocol (for a new Claude session)
1. `git checkout main && git pull`
2. `npm ci` (skip until T02 is done)
3. `npm test` must pass before you start (skip until T03 is done)
4. Do the **first unchecked task** below, following the Ground rules in PLAN.md
5. Tick its box in the same commit; single-line message; author `Fayaz Ahmed <me@fayaz.dev>`; no trailers
6. `git push origin main`
7. At a phase end: bump `package.json` version, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin vX.Y.Z`
8. Log reproducibility-relevant actions (clips, live-run seconds, perf numbers, deviations) in IMPLEMENTATION_NOTES.md

**Phase 0 — Plan & scaffold → v0.1.0**
- [x] T01 Add PLAN.md, TASKS.md, IMPLEMENTATION_NOTES.md (with the environment baseline: OS, Node, npm and xvfb versions), and a short CLAUDE.md that points new sessions to TASKS.md and the ground rules
- [x] T02 Scaffold:
  - package.json with Electron pinned (latest stable) and `@smartspectra/node-sdk@3.5.0` exact
  - tsconfig, `scripts/build.mjs` (esbuild), and a `.gitignore` covering `dist`, `test-assets`, `.presage-usage.json` and `node_modules`
  - main opens a placeholder control window; `npm start` works
- [x] T03 Set up Vitest, ESLint, Prettier and the `npm test` script, plus core/util (Clock/FakeClock, RingBuffer, percentile, Hysteresis, easing) with tests
- [x] T04 Playwright Electron smoke e2e (`npm run test:e2e` through xvfb-run) and a GitHub Actions CI workflow; tag v0.1.0

**Phase 1 — SDK spike & signal model → v0.2.0**
- [x] T05 `scripts/presage-budget.mjs` (900 s ledger, unit-tested) and `scripts/fetch-test-video.sh`. The script pins the clip URL and sha256; record the clip's provenance in IMPLEMENTATION_NOTES.md
- [x] T06 `scripts/live-probe.mjs`:
  - uses the main-process SDK `useFile` on the test clip for ≤60 s, budget-guarded, with telemetry off
  - logs field shapes, landmark count, validation codes and metric rates
  - writes the findings to `docs/sdk-notes.md`
- [x] T07 shared/types and settings (defaults and validation), plus `sensing/requestedMetrics` with tests
- [x] T08 `features/LandmarkLayout` (with layout detection) and `sensing/metricsMapper`, tested against fixtures encoded with `Metrics.encode`; tag v0.2.0

**Phase 2 — Signal trackers → v0.3.0**
- [x] T09 Calibrator and Baseline (neutral pose, closed-mouth gap, resting happy level, eye openness, blink rate)
- [x] T10 headPose (pitch and yaw from the nose against the eye midpoint, divided by eye distance, smoothed), mouthGap and eyeOpenness
- [x] T11 BreathingNormalizer with idle-breath fallback
- [x] T12 BlinkDetector (SDK blinks plus landmark backup, with refractory period)
- [x] T13 GestureDetector: nod, shake, enthusiastic
- [x] T14 SmileDetector, TalkTracker and PresenceTracker (validation and face → present/away/waking)
- [x] T15 PoseMapper (amplification, reduced motion, mouth shown only while talking, laugh flag); tag v0.3.0

**Phase 3 — Auto & modes → v0.4.0**
- [x] T16 Auto rules and AutoPolicy (minimum wins, 2 s hold, immediate drops for no face and look-away, hysteresis) with fast-check invariant tests
- [x] T17 ComfortShield (lazy baseline, triggers, 15% cap, 20 s recovery)
- [x] T18 OpacitySmoother (40%/s Auto rate limit, eased 450 ms cross-fades)
- [x] T19 ModeController (State) and Commands (HideMe, Pin, RaiseHand, BackSoon, CycleMode)
- [x] T20 StudioEngine facade, with a FakeClock integration test that drives a scripted signal sequence and checks the opacity timeline; tag v0.4.0

**Phase 4 — Stage rendering → v0.5.0**
- [x] T21 Character interface, registry and seeded `sketch.ts` hand-drawn primitives, plus reduced-motion and high-contrast style variants
- [x] T22 Paper lantern: ribs breathe, ink-dot eyes, bob and sway, mouth, candle flare, ember with a "back soon" tag, tassel raised hand
- [x] T23 Houseplant: leaves breathe, leaf-eyes, nod and sway, pot-rim mouth, flowers open, droop with a watering can, leaf raised hand
- [x] T24 StageCompositor:
  - layer order, feed opacity, blur below 30%, Over and Beside layouts
  - badges: speaking ring, raised hand, back soon
  - test pattern
- [x] T25 Stage window:
  - opened by `window.open` with `setWindowOpenHandler` (frameless 1280×720 "Stand-In Stage")
  - 30 fps loop and control-window thumbnail
  - e2e snapshots of both characters at tile size
  - tag v0.5.0

**Phase 5 — Demo mode → v0.6.0**
- [x] T26 DemoSignalSource with keyboard input (N S T B H E L A P; T is hold-to-talk)
- [x] T27 60 s scripted meeting loop and procedural `sampleFeed` (`canvas.captureStream`); "DEMO – simulated signals" badge in the control window only; demo e2e; tag v0.6.0

**Phase 6 — App shell & UI → v0.7.0**
- [x] T28 Main process:
  - settingsStore (saves only character and mode settings), typed IPC
  - contextBridge preload, which also requires the SDK preload
  - CSP and a media permission handler limited to `file://`
- [x] T29 Consent screen (all §6 statements, a Telemetry and Privacy link, residual-risk text); the camera stays off until consent
- [x] T30 Camera manager: enumerate devices, filter out virtual cameras with a tested `cameraFilter`, camera picker, capture profile
- [x] T31 PresenceDial (drag or keyboard; the needle follows Auto; lantern and face icons brighten), ModeSwitch and live thumbnail
- [x] T32 ModePanel:
  - Blend slider with 25/50/75 presets and Over/Beside
  - Auto max and listening levels, Comfort-shield toggle
  - Camera-badge toggle, character and background, reduced-motion and high-contrast options
- [x] T33 Global hotkeys (Command): Hide me, Pin, Raise hand, Back soon, Cycle mode, plus a help overlay
- [x] T34 OBS 3-step checklist (Window Capture "Stand-In Stage", then Start Virtual Camera, then pick OBS Virtual Camera in the meeting app; Linux v4l2loopback note) with a test-pattern button and screen-share fallback; tag v0.7.0

**Phase 7 — Presage live integration → v0.8.0**
- [x] T35 API key:
  - main reads `PRESAGE_API_KEY`, or a key pasted in the UI that is kept only in main's memory
  - `sdkKeyInjection` Decorator is applied before `bindSmartSpectraIpc`
  - a test asserts that the renderer can't read the key and that the SDK internals still match 3.5.0
- [x] T36 PresageSignalSource:
  - `useMediaStream`, `decodeMetrics` and `validationStatus` mapping
  - error and retry policy: authentication or credit errors switch to an offer of Demo mode; retryable errors back off
  - `enableTelemetry:false`; reconfigures when the shield is toggled; no `videoOutput` listener
- [x] T37 CalibrationWizard (15 s; prompts for framing with the upper chest visible, a nod and a smile; fed into the Calibrator)
- [x] T38 Performance: measure SDK-delivered fps and stage fps with the fake camera at 1280×720, 960×540 and 640×360; pick the default; fall back on `kSustainedLowFrameRate`; record the numbers in docs/sdk-notes.md
- [x] T39 `npm run test:live` (Electron, fake MJPEG camera, real SDK, ≤120 s, budget-guarded); tag v0.8.0

**Phase 8 — Nice-to-haves → v0.9.0** (cut first if time runs short)
- [x] T40 Cat character
- [x] T41 Cloud character
- [x] T42 Laugh sparkle burst and the corner character badge in Camera mode
- [x] T43 Per-meeting presets (save, apply, delete); tag v0.9.0

**Phase 9 — Hardening & release → v1.0.0**
- [x] T44 Error and empty states (no camera, invalid key, credits exhausted, OBS missing), accessibility pass (keyboard, ARIA labels, contrast), full e2e regression
- [x] T45 Final live smoke (≤120 s); Playwright screenshots and a short webm of Demo mode in docs/media; report the total budget used
- [x] T46 README.md: features, requirements, install and run on Linux/Windows/macOS (tested on Ubuntu 24.04), API key, OBS setup including Linux v4l2loopback, Demo mode, hotkeys, privacy, testing, architecture
- [x] T47 POST.md following the DEV template:
  - Template parts: front matter with `tags: devchallenge, presagechallenge`, the italic challenge line, What I Built, Demo, Code, How It Responds to Human Signals, Prize Categories (both), Consent and Data Handling, Agent Session
  - Verify the Bailenson 2021 and Fauville et al. 2021 citations by web search
  - Leave placeholders for the user's demo video and agent-session link
- [x] T48 Set version 1.0.0, add CHANGELOG.md, tag v1.0.0 and push

**Phase 10 — Intents & stability → v1.1.0** (requested after v1.0.0; developed on the session branch `claude/upbeat-wozniak-rslrk1`)
- [x] T49 Graceful SDK shutdown (stop and destroy every live session before exit) and serialised camera/SDK transitions; `scripts/repro-quit.mjs` for the reported `napi_throw` crash
- [x] T50 Signal catalogue: iris gaze, people in view, and every Presage-derived signal with states, memberships and doc links; `docs/intents.md`
- [x] T51 Intent core: built-in and custom intents, matcher with specificity and privacy-first tie-breaks, tracker, tuning and conflict analysis
- [x] T52 IntentPolicy and DecisionTrace in StudioEngine; Auto no longer hides the speaker on validation flicker
- [x] T53 Settings: intents, custom intents, opt-in tuning save, developer mode
- [x] T54 Design tokens and the tabbed control-window layout with the current-intent card and intent list
- [x] T55 Intent builder dialog: signal catalogue with doc links, condition editor, live match, tuning and conflict warnings
- [x] T56 Developer mode decision log drawer
- [x] T57 Docs, version 1.1.0 and tag (live face smoke not run: Wikimedia returned HTTP 429 for the test clip; see IMPLEMENTATION_NOTES)

**Phase 11 — Camera mode without the API → v1.2.0** (session branch `claude/upbeat-wozniak-rslrk1`)
- [x] T58 Pause the Presage SDK in Camera mode (1.5 s debounce, resume on leaving it, configured-but-paused start); engine paused/warming states so a paused SDK never looks like an empty chair; status chip and notes
- [x] T59 Budget-guarded live check that SDK traffic stops in Camera mode, docs, version 1.2.0 and tag
