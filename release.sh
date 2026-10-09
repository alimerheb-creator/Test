#!/usr/bin/env bash
# Builds both apps from the same game files and puts them where players download them:
#   apk/SixthFront.apk (Android) and exe/SixthFront.exe (Windows).
# Every game update ships both: bump the version in package.json and android/AndroidManifest.xml first.
set -euo pipefail

cd "$(dirname "$0")"
VERSION="$(node -p "require('./package.json').version")"
grep -q "android:versionName=\"${VERSION%.0}\"" android/AndroidManifest.xml ||
  echo "warning: android/AndroidManifest.xml versionName does not match package.json ($VERSION)" >&2

bash android/build-apk.sh
bash windows/build-exe.sh
mkdir -p apk exe
cp android/build/SixthFront.apk apk/SixthFront.apk
cp windows/build/SixthFront.exe exe/SixthFront.exe
echo "==> release $VERSION"
ls -lh apk/SixthFront.apk exe/SixthFront.exe
