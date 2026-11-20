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

## Deviations from PLAN.md
- **T05, fake camera format:** the plan called for a `.y4m` file, but 60 s of 960×540 y4m is about 1 GB. Chromium's `--use-file-for-fake-video-capture` also accepts **`.mjpeg`** (51 MB here), so the fake camera uses `test-assets/face.mjpeg`. The SDK file probe uses `face.mp4`.
- **Tags:** pushes are blocked here, as described under "Git tags" above.
- **T38, camera filter:** the first live run found that Chromium names a file-backed fake camera after its file path. Ours contained `stand-in-studio`, which matched an over-broad `/stand-?in/` virtual-camera pattern. The pattern was removed.
- **T38, live budget accounting:** `run-live.mjs` bills only the time the SDK actually ran, from the camera click to stop.
