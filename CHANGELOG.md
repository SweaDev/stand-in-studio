# Changelog

All notable changes to Stand-In Studio. Versions follow the phases in [PLAN.md](PLAN.md).

## 1.6.0 — 2026-11-23
- **Status bar:** pills at the top show the input, whether the camera is on, what Presage is reading (camera name or video file) and the Stand-In Camera.
  - **Camera off** is a privacy shutter. The webcam is released, Presage stops, and the meeting sees only your character until you turn it back on. Hide me is left untouched.
  - **Presage off** stops analysis at once while the camera keeps running. Auto holds its level.
- **Camera tab controls the input:** switch between Camera, Video file and Demo (simulated or a saved demo) in place, without going back to the start screen. It also has the camera and resolution, a readout of what Presage reads with its on/off switch, and *Back to start screen*. *Change input* on the preview opens it.
- **Tidy start screen:** five key points, with every privacy detail under *All privacy details*. Then three cards: your camera (with a picker when there are several), a video file (with *Save its telemetry as a demo*), and Demo mode.
- **Saving a demo is obvious:** a *Save this clip as a demo* card under the clip, with REC, a progress bar, Cancel and *Play it now*. *Record a demo* uses the same card.
- **Essentials by default:** the main window shows the dial, modes, preview, Hide me, status bar, calibration and ways to send the stage. **Advanced → Interface** shows the other override buttons and the intent list, or hides calibration, the send-to-meeting section and presets. Hotkeys always work.
- **Help tab and tour:** getting started, the modes, every shortcut, sending to the meeting and privacy in brief. **F1** or **?** opens it. A one-minute interactive tour is offered once on first run and can be taken again from Help.

## 1.5.1 — 2026-11-23
- Confirmed and tested: recorded videos and saved-demo replays go out through the Stand-In Camera like the webcam does. When you switch to a replay, the camera restarts on the new source by itself. A paused clip holds its picture while frames keep flowing, so meetings never see the camera drop.

## 1.5.0 — 2026-11-23
- **Stand-In Camera (Linux): no OBS needed.** The Virtual Stage appears in Meet, Zoom or Teams as a webcam called "Stand-In Camera".
  - It is the default on Linux and keeps working while the Virtual Stage window is closed.
  - The stage is converted to YUYV on the GPU (WebGL2, with a JS fallback) and written to a v4l2loopback device, the way OBS's own virtual camera does.
- **One-time setup:** one password prompt (pkexec) makes the camera persistent. v4l2loopback loads at boot, with a "Stand-In Camera" and an "OBS Virtual Camera" device, so OBS keeps working. Existing v4l2loopback options are left alone. If v4l2loopback is missing, the app shows the install commands.
- **One place for every option:** *Send the stage to your meeting* offers the Stand-In Camera (Linux), OBS Studio and screen sharing on every platform. The OBS steps fold away while the Stand-In Camera is live.
- **Clean stop:** turning the camera off, or quitting, leaves meeting apps on a "Stand-In paused" picture.
- **Fix:** the app never picks its own Stand-In Camera as its input camera.

## 1.4.0 — 2026-11-22
- **Live input preview:** the control window's big preview shows the raw input (camera, recorded clip or demo video), labelled by source. Before, it repeated the stage.
- **Virtual Stage inset:** a small inset in the preview's corner shows the processed output, even while the window is closed. Click it to open the window.
- **"Stand-In Virtual Stage":** the stage window is renamed. If you set up OBS before, pick the window again; the OBS checklist says so.
- **Open/Close Virtual Stage Window:** the window stays frameless for a clean capture. Its button now follows the window and closes it too, including when the window manager closes it.

## 1.3.1 — 2026-11-22
- **Single-file demos:** Export also writes `<name>.standin-demo.zip`, with the video, telemetry and name in one file, so the clip and its telemetry can't be separated when shared. Import accepts the zip as well as a video + JSON pair.
  - The bundle is a plain stored ZIP, written and read without a dependency. Folders, traversal, compressed or encrypted entries and checksum mismatches are refused.
- The file pickers in the Demo library match the app's buttons.

## 1.3.0 — 2026-11-22
- **Recorded input:** *Use a recorded video…* plays a video file in place of the camera, and all four modes work on it. With an API key Presage analyses the clip like a webcam. Pausing the clip pauses the SDK.
- **Save telemetry:** plays the clip once and saves it, with the signals Presage returned, as a **demo**. Face signals are saved by default, and pulse and breathing only when ticked. A privacy notice comes first, every time.
- **Record a demo** (Camera tab): records the webcam together with its live telemetry.
- **Saved demos replay offline:** pick one under Demo on the start screen. The saved telemetry drives Auto in step with the video, with no API use. The live check measured the same intent sequence as the live run and 99% sample agreement.
- **Demo library** (Advanced):
  - kept in the app's data folder by default, or a folder you choose, so demos survive rebuilds;
  - play, rename, export (video + `.telemetry.json`), delete and import.
- **Saved demos never go in the repository:** `.gitignore` covers `demos/` and `*.telemetry.json`.

## 1.2.0 — 2026-11-22
- **Camera mode no longer uses the Presage API.**
  - The SDK is paused 1.5 s after entering Camera mode and resumed on leaving it. Quick mode cycling doesn't stop and restart it.
  - Starting the camera while in Camera mode configures the SDK without starting it.
  - While paused there is no "back soon" badge. After resuming, Auto holds its level until data arrives.
  - A status chip and the current-intent card show that Presage is paused.
- Verified live with the real SDK: no validation reports for 4 s in Camera mode, then analysis resumed in Auto.

## 1.1.0 — 2026-11-22
- **Fix:** quitting no longer risks a native abort (`napi_throw`, SIGABRT). The app stops and destroys every SmartSpectra session before it exits, and camera restarts, camera switches and the frame-rate step-down are serialised so two SDK sessions never overlap.
- **Fix:** Auto no longer hides you while you talk to the camera. SDK validation flicker (`kTooDark`, `kExcessiveMotion`) and head motion while speaking used to trip the "poor framing" and "look away" rules.
- **Intent-based Auto:**
  - Built-in intents (talking in the meeting, listening, talking to someone else, turned away, looking elsewhere, eating, someone else in view, away), each with an action you choose: Reveal me, Blend, Cover me or Back soon.
  - Intents are checked in priority order and can be reordered and disabled.
- **Signal catalogue:** every Presage-derived signal (talking, head turn and tilt, **iris gaze**, mouth, expressions, eyes, nod or shake, face in view, **people in view**, and opt-in pulse and breathing rate), with its SDK source and a link to Presage's documentation.
- **Custom intent builder:** a live match meter, and conflict analysis that warns about overlaps and blocks intents that could never win.
- **Tuning:** record an intent for 6 s to fit its thresholds to you, or use the guided "Tune intents to you". Learned thresholds are saved only on opt-in, with a privacy warning.
- **Developer mode:** a live decision log (signals, intent scores, limiting condition, winner, policy step) with pause, filter and JSON-lines copy. It is on screen only.
- **Redesigned control window:** design tokens, settings tabs (Auto, Stage, Camera, Advanced), a live current-intent card and the intent list.
- Demo key **O** (talk to someone off to the side).

## 1.0.0 — 2026-11-20
- README with install, OBS setup (including Linux v4l2loopback), hotkeys, privacy, testing and architecture.
- DEV challenge submission post (`POST.md`).
- Accessibility scan (axe-core, WCAG A/AA), keyboard reachability and no-camera error-state tests.
- Demo-mode media capture (`docs/media`) and the final live smoke test (Presage usage: 324.8 s of the 900 s budget).

## 0.9.0 — Nice-to-haves
- Cat and cloud characters.
- Laugh sparkles and the Camera-mode corner badge, verified end to end.
- Per-meeting presets.

## 0.8.0 — Presage live integration
- API key kept in the main process and injected into the SDK bridge (Decorator). The renderer never sees it.
- `PresageSignalSource` on the app's own camera stream: minimal metric requests, telemetry off, retry with back-off, Demo fallback.
- Calibration wizard.
- Measured capture-size trade-offs; steps down only on a sustained low frame rate.
- `npm run test:live`: real SDK on a fake camera, budget-guarded.

## 0.7.0 — App shell and UI
- Consent screen, settings store, typed IPC, camera manager (virtual cameras excluded).
- Presence dial, mode switch, settings panel.
- Global hotkeys and the OBS checklist with test pattern.

## 0.6.0 — Demo mode
- Keyboard-driven simulated signals, a 60-second scripted meeting, a procedural sample feed and the demo badge.

## 0.5.0 — Stage rendering
- Hand-drawn sketch primitives, paper lantern and houseplant characters, the stage compositor and the "Stand-In Stage" window.

## 0.4.0 — Auto and modes
- Auto rules and policy (the show-less-never-more invariant), Comfort shield, opacity smoother, mode state machine, commands and the `StudioEngine` facade.

## 0.3.0 — Signal trackers
- Calibration, face features, breathing normaliser, blink and gesture detectors, smile/talk/presence trackers and the pose mapper.

## 0.2.0 — SDK spike and signal model
- Presage budget ledger, public-domain test clip, live SDK probe (`docs/sdk-notes.md`), shared types and settings, metrics mapper.

## 0.1.0 — Scaffold
- Electron + TypeScript + esbuild, Vitest, ESLint, Prettier, Playwright e2e and CI.
