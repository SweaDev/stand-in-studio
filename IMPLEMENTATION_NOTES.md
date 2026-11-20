# Implementation Notes

A log of actions and measurements needed to reproduce how Stand-In Studio was built and tested. Newest entries go at the bottom of each section.

## Environment baseline (recorded 2026-11-20)
- OS: Ubuntu 24.04.5 LTS (cloud container; closest available to Ubuntu 26.04), kernel 6.18.44-fc-v726, x86_64
- Node v22.23.5, npm 10.9.9
- Xvfb 2:21.1.12-1ubuntu1.9 (`xvfb-run -a` for headless Electron)
- ffmpeg version 6.1.1-3ubuntu5
- No physical webcam: live tests use Chromium's fake capture device fed from a `.y4m` clip
- `PRESAGE_API_KEY` provided as an environment variable (never committed)

## Test media
_None yet._ Add each clip with its source URL, title, author, licence, download date, the ffmpeg command used and its sha256. Clips live in the git-ignored `test-assets/` folder.

## Presage live-run budget (cap 900 s)
| Date | Task | Script | Seconds | Running total |
|---|---|---|---|---|

## Performance measurements
_None yet._

## Deviations from PLAN.md
_None yet._
