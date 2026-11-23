#!/bin/bash
set -euo pipefail
shopt -s nullglob
images=(release/*.dmg)
test "${#images[@]}" -eq 1
mount="$RUNNER_TEMP/nightreign-dmg"
mkdir -p "$mount"
hdiutil attach "${images[0]}" -mountpoint "$mount" -nobrowse -readonly
trap 'hdiutil detach "$mount" || true' EXIT
apps=("$mount"/*.app)
test "${#apps[@]}" -eq 1
binary=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${apps[0]}/Contents/Info.plist")
file "${apps[0]}/Contents/MacOS/$binary"
executable="${apps[0]}/Contents/MacOS/$binary"
node tests/packaged-smoke.mjs "$executable"
