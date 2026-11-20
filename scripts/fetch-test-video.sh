#!/usr/bin/env bash
# Downloads the public-domain test clip used for live SDK tests and converts it into
#   test-assets/face.mjpeg  -> Chromium fake camera (--use-file-for-fake-video-capture)
#   test-assets/face.mp4    -> SDK file input (scripts/live-probe.mjs)
# The clip is never committed (test-assets/ is git-ignored). Provenance: IMPLEMENTATION_NOTES.md.
set -euo pipefail

URL="https://upload.wikimedia.org/wikipedia/commons/d/d9/Science_Speaks_-_Talking_to_Women_in_Science_%28Sudha%2C_Medical_Officer%29.webm"
SHA1="d72dfee4cdca61e03932e1212635d79f69069464"
START=160   # continuous single-speaker shot from 160 s to 222 s
DURATION=60
FILTER="crop=1040:585:120:0,scale=960:540,fps=30"

cd "$(dirname "$0")/.."
mkdir -p test-assets
src="test-assets/source.webm"

if [[ ! -f "$src" ]] || [[ "$(sha1sum "$src" | cut -d' ' -f1)" != "$SHA1" ]]; then
  echo "Downloading test clip (~53 MB)..."
  curl -fSL --retry 3 -A "stand-in-studio-test-fetch/1.0" -o "$src" "$URL"
fi
actual="$(sha1sum "$src" | cut -d' ' -f1)"
if [[ "$actual" != "$SHA1" ]]; then
  echo "sha1 mismatch: expected $SHA1, got $actual" >&2
  exit 1
fi

ffmpeg -loglevel error -y -ss "$START" -t "$DURATION" -i "$src" -an -vf "$FILTER" -q:v 4 test-assets/face.mjpeg
ffmpeg -loglevel error -y -ss "$START" -t "$DURATION" -i "$src" -an -vf "$FILTER" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 20 test-assets/face.mp4
# Extra fake-camera resolutions for the performance check (T38).
ffmpeg -loglevel error -y -ss "$START" -t "$DURATION" -i "$src" -an -vf "crop=1040:585:120:0,scale=1280:720,fps=30" -q:v 4 test-assets/face-1280x720.mjpeg
ffmpeg -loglevel error -y -ss "$START" -t "$DURATION" -i "$src" -an -vf "crop=1040:585:120:0,scale=640:360,fps=30" -q:v 4 test-assets/face-640x360.mjpeg
cp test-assets/face.mjpeg test-assets/face-960x540.mjpeg
sha256sum test-assets/face.mjpeg test-assets/face.mp4
echo "Test clip ready in test-assets/"
