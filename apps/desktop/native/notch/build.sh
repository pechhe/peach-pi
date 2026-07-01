#!/usr/bin/env bash
# Build the native notch helper (ADR-0016). Outputs .build/release/notch-helper,
# which notch-service.ts spawns in dev; packaging copies it into Resources.
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release
echo "built: $(pwd)/.build/release/notch-helper"
