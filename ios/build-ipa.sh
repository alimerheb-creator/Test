#!/usr/bin/env bash
# Builds the iPhone/iPad app as an unsigned ios/build/SixthFront.ipa from the same game files as the Android
# and Windows apps (the bundle android/prepare-web.mjs makes). Needs a Mac with Xcode, Node (npm install done)
# and XcodeGen (brew install xcodegen). The GitHub workflow .github/workflows/ios.yml runs this on every game
# update and commits the result to ipa/SixthFront.ipa.
set -euo pipefail

cd "$(dirname "$0")"
VERSION="$(node -p "require('../package.json').version")"
BUILD="$(sed -n 's/.*android:versionCode="\([0-9]*\)".*/\1/p' ../android/AndroidManifest.xml)"

echo "==> web bundle"
node ../android/prepare-web.mjs "$PWD/www"

echo "==> Xcode project (version $VERSION, build $BUILD)"
xcodegen generate --quiet

echo "==> build"
rm -rf build
xcodebuild -project SixthFront.xcodeproj -scheme SixthFront -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath build/dd \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  -quiet build

echo "==> ipa"
mkdir -p build/Payload
cp -R build/dd/Build/Products/Release-iphoneos/SixthFront.app build/Payload/
(cd build && zip -qry SixthFront.ipa Payload)
ls -lh build/SixthFront.ipa
