#!/usr/bin/env bash
# Builds android/build/SixthFront.apk without Gradle or the Google SDK manager.
# Needs: Node (for esbuild), a JDK (javac), and the Ubuntu/Debian packages
#   aapt dalvik-exchange zipalign apksigner android-sdk-platform-23
#   sudo apt-get install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
AND="$ROOT/android"
OUT="$AND/build"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
DX="$(command -v dalvik-exchange || command -v dx)"

for tool in javac aapt zipalign apksigner node; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done
[ -f "$ANDROID_JAR" ] || { echo "android.jar not found at $ANDROID_JAR" >&2; exit 1; }
[ -d "$ROOT/node_modules/esbuild" ] || npm install --no-audit --no-fund

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/assets"

echo "==> web bundle"
node "$AND/prepare-web.mjs" "$OUT/assets/www"

echo "==> java"
javac --release 8 -nowarn -Xlint:-options -classpath "$ANDROID_JAR" -d "$OUT/classes" $(find "$AND/java" -name '*.java')
"$DX" --dex --output="$OUT/classes.dex" "$OUT/classes"

echo "==> package"
aapt package -f -M "$AND/AndroidManifest.xml" -S "$AND/res" -A "$OUT/assets" -I "$ANDROID_JAR" -F "$OUT/unsigned.apk"
(cd "$OUT" && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "==> sign"
apksigner sign --ks "$AND/debug.keystore" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias sixthfront --out "$OUT/SixthFront.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/SixthFront.apk"
rm -f "$OUT/unsigned.apk" "$OUT/aligned.apk" "$OUT/SixthFront.apk.idsig"
ls -lh "$OUT/SixthFront.apk"
