# Sixth Front

## Every game update ships both apps

The game is released as an Android app (`apk/SixthFront.apk`) and a Windows app (`exe/SixthFront.exe`), and
they always move together. Whenever the game changes:

1. Bump the version: `version` in `package.json`, and `versionCode` (+1) and `versionName` in
   `android/AndroidManifest.xml`.
2. Run `npm run release`. It builds both apps from the same game files and copies them to `apk/` and `exe/`.
3. Commit `apk/SixthFront.apk` and `exe/SixthFront.exe` together with the change, and send both files to the
   user.

A hook in `.claude/settings.json` blocks a commit where only one of the two changed. A change that really
concerns one wrapper only (`android/java`, `windows/*.go`) can say `[android-only]` or `[windows-only]` in
the commit message.
