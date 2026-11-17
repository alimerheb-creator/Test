# Sixth Front

## Every game update ships all three apps and the browser version

The game is released as an Android app (`apk/SixthFront.apk`), a Windows app (`exe/SixthFront.exe`) and an
iPhone/iPad app (`ipa/SixthFront.ipa`), and it can also be played in the browser as a claude.ai artifact. All
four always move together. Whenever the game changes:

1. Bump the version: `version` in `package.json`, and `versionCode` (+1) and `versionName` in
   `android/AndroidManifest.xml` (the iOS app takes its version and build number from these two).
2. Run `npm run release`. It builds the Android and Windows apps from the same game files and copies them to
   `apk/` and `exe/`.
3. Commit `apk/SixthFront.apk` and `exe/SixthFront.exe` together with the change, and push.
4. The iOS app needs a Mac, so GitHub builds it: the workflow `.github/workflows/ios.yml` runs on the push,
   builds `ipa/SixthFront.ipa` with `ios/build-ipa.sh` and commits it to the branch. Wait for that commit
   ("iOS app x.y.z"), pull it, check it is the new version, and send all three files to the user.
5. Update the browser version too. The user asked for this on every update. It is the artifact
   https://claude.ai/artifact/ATPzitk2Q2tKHkaWXycFin. Publish to that same URL so the link stays the same,
   using the web build `npm run release` leaves in `windows/www`:
   - the page: `windows/www/index.html`, with `root` set to `windows/www`;
   - `files`: every other file in that folder at the same paths (`game.js`, `css/`, `fonts/`, `mods/`,
     `apple-touch-icon.png`; not `sounds/README.md`);
   - `label` set to the version (e.g. "1.68.0"), with the version in the description kept current;
   - no `capabilities`, so the page keeps its `room` capability for online play.

   If the publish refuses files you haven't read in this session, read them with the artifact `read` action,
   check they match the previous release in git, then publish again. Give the user the artifact link together
   with the three apps.

A hook in `.claude/settings.json` blocks a commit where only one of the Android and Windows apps changed. A
change that really concerns one wrapper only (`android/java`, `windows/*.go`, `ios/`) can say
`[android-only]`, `[windows-only]` or `[ios-only]` in the commit message.
