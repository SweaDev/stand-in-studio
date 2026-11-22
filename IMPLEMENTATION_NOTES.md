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
| 2026-11-22 | T49 | `repro-quit.mjs` on the fixed build: session stopped and destroyed before exit, exit code 0 | 20.2 | **370.2** |

**Total Presage usage: 370.2 s (about 6.2 min) of the 15-minute cap.**

## Demo media
`docs/media/*` is generated in Demo mode by `xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/capture-media.mjs`. It uses no camera, no API key and no real person. `demo.webm` is the last 30 s of a Playwright recording of the stage window during the scripted meeting, re-encoded with VP9 at 640×360, 20 fps and 350 kbit/s.

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
| v1.1.0 | (the T57 commit, branch `claude/upbeat-wozniak-rslrk1`) | Release 1.1.0: intents, builder, decision log, shutdown fix |

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

