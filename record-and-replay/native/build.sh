#!/usr/bin/env bash
# Build the native capture binary via swiftc. Outputs native/capture.
set -euo pipefail
cd "$(dirname "$0")"
swiftc \
  -O \
  -framework Cocoa \
  -framework ApplicationServices \
  -framework CoreGraphics \
  -framework ImageIO \
  -framework ScreenCaptureKit \
  -framework UniformTypeIdentifiers \
  capture.swift \
  -o capture
echo "built: $(pwd)/capture"
