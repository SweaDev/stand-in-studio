# Implementation Notes

A log of actions and measurements needed to reproduce how Stand-In Studio was built and tested. Newest entries go at the bottom of each section.

## Environment baseline (recorded 2026-11-20)
- OS: Ubuntu 24.04.5 LTS (cloud container; closest available to Ubuntu 26.04), kernel 6.18.44-fc-v726, x86_64
- Node v22.23.5, npm 10.9.9
- Xvfb 2:21.1.12-1ubuntu1.9 (`xvfb-run -a` for headless Electron)
- ffmpeg version 6.1.1-3ubuntu5
- No physical webcam: live tests use Chromium's fake capture device fed from a `.y4m` clip
- `PRESAGE_API_KEY` provided as an environment variable (never committed)
- **Vulkan:** the SDK's expression models need it. The container had none, so the first probe failed. Installed Mesa's CPU Vulkan driver with `apt-get install -y mesa-vulkan-drivers libvulkan1 vulkan-tools` (Mesa 25.2.8, llvmpipe). Check it with `vulkaninfo --summary`.

## Test media
Clips live in the git-ignored `test-assets/` folder and are never committed. Recreate them with `./scripts/fetch-test-video.sh`.

### Clip 1: "Science Speaks - Talking to Women in Science (Sudha, Medical Officer)" (downloaded 2026-11-20)
- Commons page: https://commons.wikimedia.org/wiki/File:Science_Speaks_-_Talking_to_Women_in_Science_(Sudha,_Medical_Officer).webm
- Original file: https://upload.wikimedia.org/wikipedia/commons/d/d9/Science_Speaks_-_Talking_to_Women_in_Science_%28Sudha%2C_Medical_Officer%29.webm
- Author: National Institute for Occupational Safety and Health (NIOSH). Licence: **public domain** (US federal government work)
- Source: VP8 1280×720 at 29.97 fps, 262.4 s, 53,056,972 bytes, sha1 `d72dfee4cdca61e03932e1212635d79f69069464` (matches the Commons record)
- Why this clip: one seated speaker facing the camera with her upper chest in frame, talking continuously, with natural head movement and hand gestures
- Segment: 160–220 s, one continuous shot (title cards fall at about 70, 110 and 150 s)
- Conversion (in `scripts/fetch-test-video.sh`), with filter `crop=1040:585:120:0,scale=960:540,fps=30`:
  - `face.mjpeg` (Chromium fake camera): `ffmpeg -ss 160 -t 60 -i source.webm -an -vf <filter> -q:v 4 face.mjpeg`. sha256 `39777c5543a08dab3448cbffccaf7507d4aa5e6c532df86a43b89acb8130a624`
  - `face.mp4` (SDK file input): `... -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 20 face.mp4`. sha256 `5722f9e8c8e91b98bd8bbd1705e8de58d9e0192e670607e1d8c91b3289560dad` (ffmpeg 6.1.1)
- Wikimedia's API needs a User-Agent and rate-limits bursts (HTTP 429). The script sends a generic UA.

### Clip 2: "Artemis Interviews with NASA Astronaut Jeanette Epps - October 4, 2019" (downloaded 2026-11-22, Phase 12)
- NASA Image and Video Library id `iss061m2627771232_Live_Interviews_Jeanette_Epps_191004`. Page: https://images.nasa.gov/details/iss061m2627771232_Live_Interviews_Jeanette_Epps_191004
- File: `…~medium.mp4` (H.264 1280×720, 1165.6 s, 345,091,605 bytes, sha256 `3f046d49ad3207c7b8daae583678212f8de1eab40410ad40dddb79f0221f1db6`)
- Author: NASA Johnson Space Center. NASA media is generally not subject to copyright in the US (NASA media usage guidelines), and the clip is used here unaltered apart from trimming. It does not imply NASA endorsement.
- Why this clip: a live satellite interview, so the speaker faces the camera and alternates between listening and talking (the captions show the turns). That exercises *Listening*, *Talking in the meeting* and *Looking elsewhere*.
- Segment: 0–45 s, via `ffmpeg -ss 0 -t 45 -i epps-medium.mp4 -an -vf "scale=960:540,fps=30" -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 22 -movflags +faststart nasa-epps-interview-45s.mp4`. sha256 `868fc873469d6de74556acf1785a0780e727fcfcef1a720d541314e5e24f4c3d`, 1,857,821 bytes.
- Neither the clip nor its saved telemetry is committed. Both were handed to the user separately.
- Wikimedia still returned HTTP 429 to a single range request, so Clip 1 was not used.

## Presage live-run budget (cap 900 s)
Each run is charged at max(wall time, content seconds), so the figures are conservative.

| Date | Task | Script | Seconds | Running total |
|---|---|---|---|---|
| 2026-11-20 | T06 | `live-probe.mjs 40` (failed after 3.4 s: no Vulkan) | 40 | 40 |
| 2026-11-20 | T06 | `live-probe.mjs 40` (after installing lavapipe) | 42.9 | 82.9 |
| 2026-11-20 | T38 | `run-live.mjs T38-perf 30 960x540`: camera filter bug, **SDK never started** (charged conservatively) | 45 | 127.9 |
| 2026-11-20 | T38 | `run-live.mjs T38-perf 30 960x540` | 31.5 | 159.4 |
| 2026-11-20 | T38 | `run-live.mjs T38-perf 20 1280x720` | 21.5 | 180.9 |
| 2026-11-20 | T38 | `run-live.mjs T38-perf 20 640x360` (no face found at this size) | 21.2 | 202.1 |
| 2026-11-20 | T39 | `npm run test:live` (60 s, all 8 checks passed) | 61.8 | 263.9 |
| 2026-11-20 | T45 | `npm run test:live`, final smoke (all 8 checks passed; 29.3 packets/s, stage 29.1 fps) | 60.9 | **324.8** |

| 2026-11-22 | T49 | `repro-quit.mjs` on the **v1.0.0** build (synthetic clip): exited cleanly, the abort did not reproduce | 25.2 | 350.0 |
| 2026-11-22 | T49 | `repro-quit.mjs` on the fixed build: session stopped and destroyed before exit, exit code 0 | 20.2 | 370.2 |
| 2026-11-22 | T59 | `live-camera-pause.mjs` (synthetic clip): 20 reports in Auto, 0 new reports over 4 s in Camera mode (status `paused`), resumed in Auto | 12.8 | 383.0 |
| 2026-11-22 | T65 | `live-recorded.mjs` (Clip 2, 45 s), all 5 checks passed. Telemetry saved: 2,562 frames, 1,063 with landmarks and talking, no body signals. The offline replay on the next launch (no API key, 0 SDK sessions) produced the same intent sequence (listening → looking elsewhere → listening → talking in the meeting → listening → talking in the meeting), with 99% of 138 time-matched samples agreeing | 51.4 | **434.4** |

**Total Presage usage: 434.4 s (about 7.2 min) of the 15-minute cap.**

## Demo media
`docs/media/*` is generated in Demo mode by `xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/capture-media.mjs`. It uses no camera, no API key and no real person. `demo.webm` is the last 30 s of a Playwright recording of the stage window during the scripted meeting, re-encoded with VP9 at 640×360, 20 fps and 350 kbit/s.

The media was refreshed for v1.4.0 (the Live input preview, the Virtual Stage inset and the current consent screen). `recorded.png` was added. It shows a recorded clip as the live input: a few seconds of Demo mode's simulated sample feed, recorded by the capture script into a temporary file that is deleted afterwards, and played with the e2e fake SDK. No real person, no Presage contact.

## Performance measurements
- T38 (2026-11-20): capture resolution against SDK packet rate and stage fps. The table is in `docs/sdk-notes.md` under "Renderer path and capture resolution". The default stays 960×540.
- Extra fake-camera clips for this check (`face-1280x720.mjpeg`, `face-640x360.mjpeg`) are produced by `scripts/fetch-test-video.sh` with the same segment and crop, scaled to each size.

## Git tags
In this cloud session the git proxy refuses tag pushes (HTTP 403), while branch pushes to `main` work. Tags are created locally as annotated tags, and the table below records them. To publish them from a machine with normal GitHub access, recreate any that are missing and push:
```bash
git tag -a v0.1.0 b0cabcb -m v0.1.0   # only if the tag is missing locally
git push origin --tags
```

| Tag | Commit | Subject |
|---|---|---|
| v0.1.0 | b0cabcb | Add Playwright Electron e2e smoke test and CI workflow |
| v0.2.0 | e70d591 | Add landmark layout strategies and SDK metrics-to-signal mapper |
| v0.3.0 | 3702a90 | Add pose mapper with cue amplification and reduced-motion support |
| v0.4.0 | 50e4e65 | Add StudioEngine facade wiring sensing, Auto, modes and smoothing |
| v0.5.0 | bca7306 | Open the frameless Stand-In Stage window and drive it with a 30 fps stage loop |
| v0.6.0 | 2055d11 | Add Demo mode with scripted meeting loop, procedural sample feed and demo badge |
| v0.7.0 | c035df7 | Add OBS setup checklist with test pattern and screen-share fallback |
| v0.8.0 | e8ed84a | Add budget-guarded live test of the real SDK on a fake camera |
| v0.9.0 | 14dde18 | Add per-meeting presets |
| v1.0.0 | (the T48 commit) | Release 1.0.0 |
| v1.1.0 | 8e822b2 (branch `claude/upbeat-wozniak-rslrk1`) | Release 1.1.0: intents, builder, decision log, shutdown fix |
| v1.2.0 | (the T59 commit, same branch) | Release 1.2.0: Camera mode pauses the Presage SDK |
| v1.3.0 | (the T65 commit, same branch) | Release 1.3.0: Recorded input, saved-telemetry demos and offline replay |
| v1.3.1 | (the T66 commit, same branch) | Release 1.3.1: single-file demo bundles |
| v1.4.0 | (the T68 commit, same branch) | Release 1.4.0: live input preview and the Virtual Stage window |
| v1.5.0 | (the T71 commit, same branch) | Release 1.5.0: the native Stand-In Camera on Linux |
| v1.5.1 | (the T72 commit, same branch) | Release 1.5.1: Stand-In Camera tests for recorded videos and replays |

## Deviations from PLAN.md
- **T05, fake camera format:** the plan called for a `.y4m` file, but 60 s of 960×540 y4m is about 1 GB. Chromium's `--use-file-for-fake-video-capture` also accepts **`.mjpeg`** (51 MB here), so the fake camera uses `test-assets/face.mjpeg`. The SDK file probe uses `face.mp4`.
- **Tags:** pushes are blocked here, as described under "Git tags" above.
- **T38, camera filter:** the first live run found that Chromium names a file-backed fake camera after its file path. Ours contained `stand-in-studio`, which matched an over-broad `/stand-?in/` virtual-camera pattern. The pattern was removed.
- **T38, live budget accounting:** `run-live.mjs` bills only the time the SDK actually ran, from the camera click to stop.
- **T49, SDK shutdown crash (reported on Wayland, v1.0.0):** Demo mode, then a pasted key, then "Start with my camera" ended about 6 min later in `FATAL ERROR: Error::ThrowAsJavaScriptException napi_throw` and SIGABRT. The SDK's `js/ffi.js` notes that koffi thunks do not keep the loop alive, so a callback relayed after isolate disposal aborts the process. The app quit without stopping or destroying the main-process SDK session. Fix: `src/main/sdkShutdown.ts` defers the first `before-quit`, stops and destroys every live session (tracked by the key-injecting subclass), then calls `app.exit(0)` (5 s timeout). Camera restarts, camera switches and the low-frame-rate step-down are serialised so two SDK sessions never overlap. `scripts/repro-quit.mjs` replays the user's steps and closes the window like a user.
- **Phase 10 branch:** at the user's request this phase is committed to `claude/upbeat-wozniak-rslrk1` instead of `main`; every other ground rule is unchanged.
- **Fresh container, budget ledger:** the git-ignored `.presage-usage.json` did not exist in the new container, so it was seeded with one settled run of 324.8 s (the total above) before any new live run.
- **T51/T52, intent priority (plan change):** the plan ranked overlapping intents by specificity, then by whichever action shows less. That made a user's custom "reveal" intent always lose to a broader built-in, and let *Listening* beat *Eating* while looking at the screen. Intents are instead checked **top to bottom, first match wins**, like firewall rules. The user reorders them, and the conflict analysis states which intent wins each overlap. Default order: Away, Someone else, Talking to someone else, Turned away, Looking elsewhere, Eating, Talking in the meeting, Listening.
- **T52, poor validation (plan change):** the plan froze intent switching while validation was "poor". Rooms that read `kTooDark` most of the time would then never cover the user, so validation now only feeds *Face in view* and *People in view*, and landmarks keep driving the other signals.
- **T52, extra built-in:** *Turned away* (not talking, head turned) is a separate built-in. Conditions are AND-only, and the old look-away rule was based on head yaw, not on eye gaze.
- **Phase 10, test clip unavailable:** in the new container, `scripts/fetch-test-video.sh` got HTTP 429 from upload.wikimedia.org for over 30 minutes. Their policy expects a contact address in the User-Agent, and none was added, to keep personal data out of requests. The T49 crash replay used a synthetic `ffmpeg testsrc2` MJPEG instead (`test-assets/synthetic-960x540.mjpeg`, git-ignored). It runs a real SDK session but contains no face, so metrics packets stayed at 0. The T57 live smoke with a face (`npm run test:live`) was therefore **not run** in this phase. The intent pipeline is covered by unit tests, Demo-mode e2e tests and synthetic landmarks, including iris points.
- **T54, forced push not used:** the T54 commit (`eb198aa`) was pushed with two ESLint errors, because a `grep` in the shell chain hid `npm test`'s exit code. Rewriting the pushed commit was not allowed, so `0d1616a` fixes them. Every later commit gates on `npm test`'s exit code.
- **Phase 10 media:** `docs/media` was regenerated with `scripts/capture-media.mjs`, which now also captures `builder.png` and `devlog.png`, at a 1440×960 window.
- **Phase 12, recorded input as a source (user decision):** *Recorded* is an input next to the camera and Demo, not a fifth mode button. Saving telemetry needs the SDK to analyse the clip, so the clip has to drive all four modes.
- **Phase 12, storage (user decision):** demos live in the user's approved data folder (`<userData>/demos` by default, changeable in Advanced). They are never in the repo, and the user shares clips and JSON separately. Only main can change the library folder, from a native folder dialog; the settings IPC drops `recorded.libraryDir` from renderer patches.
- **Phase 12, file access:** the renderer reads clips through `<input type=file>` and gets saved demos back as bytes over IPC, played from blob URLs. No custom protocol was needed, contrary to the plan's `standin-media://`, and the page CSP is unchanged.
- **Phase 12, task boundaries:** the saved-demo picker and the offline replay landed in the T62 commit, together with the recorded input, because they share the same `begin()` path. T64 added the Advanced → Demo library panel.
- **Phase 12, MediaRecorder WebM:** in-app recordings have no duration in their header, so `RecordedFeed` seeks far ahead once to learn it.
- **T66, test demo delivery:** the first hand-off of Clip 2 reached the user without the MP4; only `SOURCE.txt` and the telemetry JSON arrived, so the pair could not be imported. The demo was resent as the MP4 alone and as `nasa-epps-interview-45s.standin-demo.zip`. It is also kept in the git-ignored `shared-demos/` folder of the working copy. The delivered zip was imported through the real UI (no API key): 2,562 frames, the same intent sequence as the live run, and 0 SDK sessions. To stop a clip and its telemetry from being separated again, Export now also writes a single-file bundle.
- **Phase 13, stage window frame (user decision):** the user first asked for Electron's default close button. OBS window capture can include a native title bar, especially on Linux/Wayland, so the user chose to keep the **Virtual Stage frameless**. The control window's button toggles between *Open* and *Close Virtual Stage Window* and follows the window's real state, including closes from the window manager.
- **Phase 13, rename:** the stage window title changed from "Stand-In Stage" to "Stand-In Virtual Stage". OBS matches windows by title, so existing OBS setups must re-pick it; the OBS checklist says so.
- **Phase 14, native virtual camera (Linux only):** this follows OBS's Linux virtual camera (`plugins/linux-v4l2/v4l2-output.c`).
  - **How OBS does it:** it checks `/proc/modules`, and if needed runs `pkexec modprobe v4l2loopback exclusive_caps=1 card_label=…`, which prompts at every boot. It then picks the first output-capable `/dev/video*` and sets `VIDIOC_S_FMT` YUYV and `VIDIOC_S_PARM` fps, with a `STREAMON` workaround for v4l2loopback 0.12–0.13. Frames go out with `write()`.
  - **What the user chose instead:** a **one-time persistent** setup. The file `/etc/modules-load.d` loads the module at boot, and `/etc/modprobe.d` defines two devices, "Stand-In Camera" and "OBS Virtual Camera". The second file is written only if no other file sets v4l2loopback options. If OBS already loaded the module, `v4l2loopback-ctl add` adds the Stand-In device.
  - **How it is built:** ioctls go through koffi, which the SmartSpectra SDK already ships and which is now a pinned direct dependency. `open` and `write` use Node `fs`, so the main loop never blocks. Devices are found from sysfs (`/sys/devices/virtual/video4linux/*/name`), so real webcams are never opened.
  - **Windows and macOS:** a signed media-source driver (Windows) and an Apple-signed Camera Extension (macOS) are needed, and neither can be built or signed here. Those platforms keep OBS and screen sharing.
- **Phase 14, what could not be tested here:** this container has no `/dev/video*` and cannot load kernel modules, so the real device path (pkexec, modprobe, the ioctls on a real v4l2loopback device) was **not** run. What *was* tested:
  - the ioctl numbers and struct layouts against the kernel definitions;
  - a real koffi `ioctl` call (ENOTTY on a plain file);
  - the device choice and frame dropping against a fake driver, and the setup outcomes;
  - end to end through the e2e `FileSink` (`STANDIN_FAKE_VCAM`): 30 frames/s of 1,843,200 bytes, the paused frame on stop, and Hide me changing the output;
  - the WebGL2 shader under software GL (`STANDIN_SWIFTSHADER=1`, e2e only): it matches the JS reference within 2 levels and keeps the orientation.
  - Conversion time in this GPU-less container: about 21 ms per frame (software WebGL2) and 25 ms (JS), with the stage holding 30 fps.
- **Phase 14, feedback-loop fix:** the input camera filter did not recognise "Stand-In Camera", so the app could have captured its own output. It is now excluded with an anchored pattern (`/^stand-in camera\b/i`), so a fake-camera file path containing "stand-in" (see T38) still passes.
- **Phase 15, user decisions:**
  - Turning the camera off from the main window is a **privacy shutter**: you stay in the workspace, and the stage shows only the character.
  - Hidden by default (Advanced → Interface): the extra override buttons and the intent list. Calibration and the ways to send the stage stay visible.
  - The tour is **offered** on first run (Start or Not now), not started automatically.
  - Telemetry can be saved from a start-screen checkbox **and** from the card under the clip.
- **Phase 15, camera off vs Hide me:** the shutter is a separate engine override (`cameraOff`). Hide me keeps its own state, and turning the camera back on restores what Hide me and the mode would show. Turning Presage off pauses the SDK at once, without the 1.5 s Camera-mode debounce, and any telemetry save or recording in progress is stopped, so no saved telemetry has a gap.
- **Phase 15, switching input in place:** this reuses the existing restart path (`doRestart(next)`, as *Play* in the demo library already did). Consent was given at launch, and the selected settings tab is kept. A video file or a saved demo never creates an SDK session for the camera, and a replay creates none at all.
- **Phase 15, e2e:** the first-run tour is not offered under the e2e harness unless `STANDIN_E2E_TOUR=1`, so the other specs are unaffected. Specs that use the hidden-by-default parts turn them on with `showAllUi()`. Fixed a race in `camera.spec.ts`, which read the test hook before the app had finished starting. No Presage live seconds were used (fake SDK throughout).
- **T81, the user's meeting clip (not in the repo):**
  - **Source:** uploaded by the user (`fm-meeting-scene.mp4`, 94.2 s, 1280×720, 30 fps, sha256 `59f0779e…dd311`). Its audio track is silent (−91 dB).
  - **Optimised:** audio dropped and re-encoded (`libx264 -crf 26 -preset slow -tune film`, faststart), 15.0 MB → 9.3 MB, with no crop, since the face stays in frame. The result is `meeting-scene.mp4`, sha256 `054d9db3…ce8c9d`.
  - **Live run:** `scripts/live-recorded.mjs … --name "Meeting scene" --reserve 130` took **103.2 s** of Presage time (ledger total 537.6 s of 900 s). It saved 4,613 telemetry frames (face signals only). The offline replay agreed with the live intents on 97% of 275 samples, with the same sequence: listening, talking in the meeting, talking to someone off to the side, turned away. The replay used 0 SDK sessions.
  - **Bundle:** `meeting-scene.standin-demo.zip` (26.1 MB, sha256 `ed30aa39…4710df`). Imported into a fresh profile with no API key, it replays offline. It was handed to the user; it lives in the git-ignored `shared-demos/` and is never committed.
- **T82, the demo video (not in the repo):** three new scripts.
  - `scripts/record-demo-video.mjs`: runs Xvfb at 3520×1080 with the app at a 1.25 device scale, and captures the control window and the Virtual Stage with two `ffmpeg x11grab` streams. It drives the UI with an injected cursor overlay (eased motion, click ripples, keycap badges) and writes scene marks plus the intent and opacity over time.
  - `scripts/make-music.mjs`: an original ambient track synthesised in Node (pads, Karplus–Strong plucks, sub, shaker, Schroeder reverb).
  - `scripts/compose-demo-video.mjs`: renders HTML cards and masks, composes framed shots, picture-in-picture and a side-by-side, cross-fades them, burns ASS subtitles with Auto lower thirds, and mixes the music at −16 LUFS.
  - **Output:** 180.2 s at 1920×1080, 30 fps.
- **T82, live use:** the first run was meant as a fake-SDK rehearsal, but the edit adding `--dry` had not applied, so it ran for real. Its live scene used **52.7 s** of Presage time (ledger 590.3 s of 900 s), within the 60 s reserved for that scene. That take was good, so it is the one used, and no other live run was made.
  - A "camera frame rate dropped too low" banner appeared mid-scene while two 1080p captures were encoding on 4 cores. The composer crops to the dialog, the Save card and the Presage readout there.
  - Native hover tooltips appear in a few frames.
- **T82, Stand-In Camera label:** the e2e `FileSink` now reports the label "Stand-In Camera", matching the real device, so recordings don't show "(test file)".
- **T84, face-following (user request):** Presage's face mesh (478 points, in the analysed frame's pixels, about 20 per second) is enough; no other data is needed.
  - **Face box:** the face outline (forehead 10, chin 152, cheeks 234/454), or an estimate from the eye distance when the outline is missing (Demo's synthetic face). It is smoothed (position about 150 ms, size about 500 ms) and held while sensing is paused.
  - **Placement:** the compositor maps the box through the same cover crop as the feed. Size 100% is the face on screen divided by each character's measured solid body (strings, tassels and stems excluded). The body figures are stored per character, and an e2e test re-measures them.
  - **Opacity:** it mirrors the dial (40% you = 60% character), capped by *Opacity over face*. At 0% the character glides back to the centre, where there is nothing left to cover.
- **T84, lip-reading zoom (accessibility, off by default):** in Auto, while the policy has committed to *reveal* (so the 2 s raise hold still applies), the feed goes to 100% even above *Your max*, but never above the Comfort shield cap. The crop eases to the face (about 60% of the height), and the character moves to a corner badge.

- **T85, demo video re-take:** take 3 (`record-demo-video.mjs --skip-live 1`) added the face-follow slider scene and the lip-reading scene, and used **no API** (ledger unchanged at 590.3 s). The composer takes shot times relative to the scene marks and uses the four live shots from the first take (`--raw-live`). The side-by-side shots of a control-window region next to the Virtual Stage are a new shot type. Native hover tooltips are now stripped during capture. Output: 178.0 s.
- **T83, media from the user's clip:** `scripts/capture-media.mjs --demo <bundle> --clip <video>` re-takes these shots on the saved demo, offline: start screen, control window, Camera tab, tour, Auto states, every character on the face, lip-reading zoom, builder, decision log and the recorded-clip view. The recorded-clip view uses the e2e fake SDK, so there is no Presage contact. The characters grid and the scripted-meeting recording stay on the simulated person. The user approved showing their face in the repo and the post.
- **T86, narration (Gemini TTS):** this uses the Interactions API (`POST /v1beta/interactions`, model `gemini-3.8-flash-tts`) with the user's replicated voice `voice_30qo3wqreno3` in `generation_config.speech_config`. The key comes only from the environment's network secret; the scripts never read it.
  - **Key restriction:** the user's key was first IP-restricted and Google refused it from this session (`API_KEY_IP_ADDRESS_BLOCKED`). The user removed the IP rule.
  - **Turns:** 16 turns, timed to the video's sections. Two were too long for their sections and were shortened, and one was re-asked with a "slightly faster" style, then sped up 2.8%.
  - **Requests:** about 20 TTS calls in total. Tier 1 allows 10 a minute, so the script waits when told to.
  - **Levels:** each turn is normalised to −18 LUFS. The mix ducks the music under the voice with a side-chain compressor: speech is about −16 LUFS, and the music in pauses about −22 LUFS.
  - **Captions:** split by sentence and timed from the real audio lengths.

