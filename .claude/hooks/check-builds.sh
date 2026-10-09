#!/usr/bin/env bash
# PreToolUse hook (Bash): the Android and Windows apps ship together. Before a git commit, if only one of
# apk/SixthFront.apk and exe/SixthFront.exe changed, block it and say to run `npm run release`.
# A commit that really concerns one app only can say so in its message: [android-only] or [windows-only].
cmd="$(jq -r '.tool_input.command // ""')"
case "$cmd" in *"git commit"*) ;; *) exit 0 ;; esac
case "$cmd" in *"[android-only]"*|*"[windows-only]"*) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
changed() { [ -n "$(git status --porcelain -- "$1" 2>/dev/null)" ]; }
apk=0; exe=0
changed apk/SixthFront.apk && apk=1
changed exe/SixthFront.exe && exe=1
[ "$apk" = "$exe" ] && exit 0
if [ "$apk" = 1 ]; then built="Android app (apk/SixthFront.apk)"; missing="Windows app (exe/SixthFront.exe)"
else built="Windows app (exe/SixthFront.exe)"; missing="Android app (apk/SixthFront.apk)"; fi
echo "Commit blocked: the $built changed but the $missing did not. Every game update ships both apps:" \
  "run \`npm run release\` to rebuild both, then commit them together." >&2
exit 2
