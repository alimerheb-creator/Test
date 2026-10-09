#!/usr/bin/env bash
# Builds windows/build/SixthFront.exe: one Windows program with the whole game packed inside.
# It opens the game in its own window through the Microsoft Edge WebView2 Runtime (part of Windows 11 and
# up-to-date Windows 10) and keeps saves in %LOCALAPPDATA%\SixthFront.
# Needs: Node (for esbuild) and Go 1.24+. Cross-compiles from Linux or macOS; no C compiler needed.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
WIN="$ROOT/windows"
OUT="$WIN/build"
VERSION="$(node -p "require('$ROOT/package.json').version")"

for tool in go node; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done
[ -d "$ROOT/node_modules/esbuild" ] || npm install --no-audit --no-fund

echo "==> web bundle"
node "$ROOT/android/prepare-web.mjs" "$WIN/www"

echo "==> icon and version info ($VERSION)"
WINRES="$(go env GOPATH)/bin/go-winres"
[ -x "$WINRES" ] || go install github.com/tc-hib/go-winres@v0.3.3
cd "$WIN"
"$WINRES" make --arch amd64 --product-version "$VERSION.0" --file-version "$VERSION.0"

echo "==> exe"
rm -rf "$OUT" && mkdir -p "$OUT"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags "-s -w -H windowsgui" -o "$OUT/SixthFront.exe" .
ls -lh "$OUT/SixthFront.exe"
