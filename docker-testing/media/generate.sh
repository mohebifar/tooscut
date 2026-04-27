#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

ffmpeg -y -f lavfi -i testsrc2=duration=10:size=1920x1080:rate=25 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p sample-video.mp4

ffmpeg -y -f lavfi -i sine=frequency=440:duration=10:sample_rate=48000 \
  -c:a pcm_s16le sample-audio.wav

echo "Sample media generated."
