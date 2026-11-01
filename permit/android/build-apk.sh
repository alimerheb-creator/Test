#!/usr/bin/env bash
# Builds permit/apk/PermitRegister.apk. Runs on GitHub Actions (needs ANDROID_HOME with build-tools + a platform).
set -euo pipefail
cd "$(dirname "$0")"
URL="$(tr -d ' \n' < app-url.txt)"
[ -n "$URL" ] || { echo "app-url.txt is empty"; exit 1; }
BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
PLAT="$(ls -d "$ANDROID_HOME"/platforms/android-* | sort -V | tail -1)/android.jar"
echo "build-tools: $BT  platform: $PLAT  url: $URL"
OUT=build; rm -rf $OUT; mkdir -p $OUT/classes $OUT/gen $OUT/res/values
cp -r res/. $OUT/res/
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_url" translatable="false">%s</string></resources>\n' "$URL" > $OUT/res/values/config.xml
"$BT/aapt" package -f -m -J $OUT/gen -M AndroidManifest.xml -S $OUT/res -I "$PLAT" -F $OUT/unsigned.apk
javac --release 8 -nowarn -Xlint:-options -classpath "$PLAT" -d $OUT/classes $(find java $OUT/gen -name '*.java')
"$BT/d8" --release --lib "$PLAT" --min-api 24 --output $OUT $(find $OUT/classes -name '*.class')
(cd $OUT && "$BT/aapt" add unsigned.apk classes.dex >/dev/null)
"$BT/zipalign" -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk
"$BT/apksigner" sign --ks release.keystore --ks-pass pass:agcpermits --key-pass pass:agcpermits --ks-key-alias permits --out $OUT/PermitRegister.apk $OUT/aligned.apk
"$BT/apksigner" verify $OUT/PermitRegister.apk
mkdir -p ../apk && cp $OUT/PermitRegister.apk ../apk/PermitRegister.apk
ls -lh ../apk/PermitRegister.apk
