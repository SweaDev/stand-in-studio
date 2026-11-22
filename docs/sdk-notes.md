# SmartSpectra SDK notes (measured)

These are facts measured with `@smartspectra/node-sdk@3.5.0` by `scripts/live-probe.mjs` on 2026-11-20. The probe used the main-process SDK, file input `test-assets/face.mp4` (960×540 at 30 fps), all face, breathing and cardio metrics, `enableTelemetry: false`, and `interframeDelayMs: 33` (about real time). The full summary is in `test-assets/probe-summary.json`, which is git-ignored.

Where these notes and PLAN.md disagree, these notes win.

## Runtime requirements
- **Vulkan is required.** Without a Vulkan driver, the expressions and phasic-BP models fail with "Vulkan is not available: vkCreateInstance failed with ErrorIncompatibleDriver". About 3 s later the session ends with `error kProcessingFailed (retryable)`.
  - On a headless Linux box or a VM, install Mesa's CPU implementation: `sudo apt install mesa-vulkan-drivers` (lavapipe/llvmpipe).
  - Desktop GPUs ship their own Vulkan drivers.
- Models are delivered remotely on first use ("Unable to resolve configured model path. Falling back to remote delivery"). The first metrics packet arrived about **2.0 s** after `start()`.
- The native runtime logs to stderr (absl/glog warnings). This is harmless.

## Packet rates (about real time, 960×540)
- About 21 `metrics` packets per second. Most packets carry 0–2 samples of each field.

| Field | Samples/s | Keys present |
|---|---|---|
| `face.landmarks` | ~20 | `value` (array of `{x,y}`), `stable`, `timestamp` |
| `breathing.upperTrace` | ~20 | `value`, `timestamp` (`stable` omitted when false) |
| `face.expression` | ~20 | `scores[] {type, confidence}`, `stable`, `timestamp` |
| `face.blinking` | ~15 | `detected`, `stable`, `timestamp` |
| `face.talking` | ~15 | `detected`, `stable`, `timestamp` |
| `breathing.rate` | ~0.2 | `value`, `timestamp` (`confidence` and `stable` may be omitted) |
| `cardio.pulseRate` | ~0.3 | `value`, `confidence`, `stable`, `timestamp` |
| `cardio.arterialPressureTrace` | bursts | not used by Stand-In Studio and **not requested** |

protobufjs omits fields that hold default values: `false`, `0` and empty arrays. Mapping code must therefore treat a missing `stable`, `detected` or `confidence` as `false`/`0`.

## Landmarks
- **478 points: the MediaPipe Face Mesh layout** (468 points plus 10 iris points).
- Coordinates are **pixels in the input frame**, not normalised. In a 960×540 frame, x ran from 414 to 788 and y from 110 to 350. Always normalise by the eye distance; never use absolute values.
- Indices checked against the sample geometry. "Image-left" means the subject's right side.

| Point | Index |
|---|---|
| nose tip | 1 (4 is the nose bridge tip) |
| outer eye corners | 33 (image-left), 263 (image-right) |
| inner eye corners | 133, 362 |
| eyelids, image-left eye | upper 159, lower 145 |
| eyelids, image-right eye | upper 386, lower 374 |
| inner lips | upper 13, lower 14 |
| inner mouth corners | 78, 308 |
| chin | 152 |
| forehead | 10 |

## Expressions
- Every expression sample carries scores for all 8 types: ANGRY=1, CONTEMPT=2, DISGUST=3, FEAR=4, **HAPPY=5**, NEUTRAL=6, SAD=7 and SURPRISE=8.
- `confidence` runs from 0 to 100. Divide by 100 to get a 0–1 value.

## Talking and blinking
- `talking.detected` was true in 633 of 652 samples while the speaker talked throughout the clip.
- `blinking.detected` was true in 38 samples. A single blink spans several consecutive true samples, so detect the **rising edge**.

## Validation status
- `validationStatus` fires about once per frame. Over 40 s of a well-lit, steady interview it reported:
  - `kOk` "Hold still and record." 811 times
  - `kTooDark` "Increase light on face." 330 times
  - `kExcessiveMotion` 56 times
  - `kChestNotVisible` 4 times
- **Non-OK codes flicker even on good input.** The "poor framing or lighting" Auto rule therefore needs hysteresis: not-OK must dominate for more than about 2 s, measured as the share of frames in a sliding window.
- The UI can show hints (the `hint` string) during calibration only.

## Lifecycle
- File input moves through `kIdle → kStarting → kRunning → kStopping → kIdle`.
- `waitUntilComplete()` **blocks the event loop**, which also stops metrics callbacks from running. Wait on `processingStatus` instead.
- When processing fails, the session moves to `kError` and emits `error(code, message, retryable)`.

## Renderer path and capture resolution (T38, measured 2026-11-20)
Setup: Electron 45 renderer SDK on the app's own `getUserMedia` stream (`useMediaStream`), Chromium fake camera fed from the MJPEG clip at 30 fps, Auto mode, a 30 fps stage loop drawing 1280×720, and a CPU-only container (Xvfb, Mesa llvmpipe, 4 cores). Run with `node scripts/run-live.mjs T38-perf <s> <profile>`.

| Capture | SDK packets/s | Stage fps (avg incl. start-up) | First packet | Landmarks / validation |
|---|---|---|---|---|
| 1280×720 | 29.3 | 26.1 | ~7 s | yes, kOk ~60% |
| **960×540** (default) | 29.8 | 28.2 | ~7 s | yes, kOk ~66% |
| 640×360 | 29.7 | 27.3 | ~10 s | **no face found**: the speaker's face is too small at this size |

- No `kSustainedLowFrameRate` at any size: the SDK kept pace with 30 fps input even on CPU.
- **Default capture: 960×540.** At 640×360, faces that are not close to the camera are lost. The app therefore steps down a resolution only when the SDK actually reports `kSustainedLowFrameRate`, one step at a time.
- The stage loop holds about 28 fps (target 30) while the SDK runs. Its compositing leaves the SDK's input untouched, because the SDK reads the camera track directly.
- The first packet arrives about 7 s after "Start with my camera". This covers camera start, the SDK pipeline and remote model delivery.

## Teardown and intent-relevant outputs (Phase 10, 2026-11-22)
- **Teardown before exit.** `js/ffi.js` notes that koffi callback thunks do **not** keep the libuv loop alive. If the main isolate is disposed while an SDK worker thread still relays a callback, the process aborts. A reported crash showed exactly this: `Error::ThrowAsJavaScriptException napi_throw`, then SIGABRT, after a Wayland session. The app therefore defers the first quit, calls `stopAsync()` and then `destroy()` on every live main-process session (5 s timeout), and only then calls `app.exit(0)`. It also never configures a new session before the previous `stop()`/`destroy()` has settled. A replay in this container (`scripts/repro-quit.mjs`, synthetic clip) logs `session created → quitting: stopping 1 → session destroyed` and exits with code 0. The original abort did not reproduce here: it is a timing race, and Xvfb has no desktop portal.
- **No intent, gaze or attention output.** SDK 3.5.0 metrics are breathing, cardio, HRV, micromotion, EDA and the face bundle (landmarks, blinking, talking, expressions). Intent signals are built from these:
  - head pose and **iris gaze** from landmarks 468 and 473 of the 478-point mesh;
  - `kMultipleFacesFound` (2) for "someone else in view";
  - all eight expression scores. The mapper now keeps happy, surprise, sad, angry and neutral.
- **`requestInsight(text)` is vitals-only.** It sends pulse, HRV and breathing-rate series plus the prompt to Presage's LLM, never video, landmarks or talking. Replies are asynchronous protobuf `Insight` messages (`analysis` or `error`). It needs breathing and cardio metrics, so it is not usable for real-time intent detection.

