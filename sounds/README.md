# Sounds everyone hears

Put a recording here and every player hears it, in all three apps, from the next release.

| File | What it is |
| --- | --- |
| `cram-alarm.mp3` | The C-RAM "incoming" alarm in the Aviation and Naval battles. It plays in place of the built-in siren and voice. `.m4a`, `.wav` and `.ogg` work too (use only one). Keep it under about 2 MB, and keep it short (a few seconds): it repeats for as long as the danger lasts. |

To add one on GitHub: open this `sounds` folder, **Add file > Upload files**, drop the file in, name it
`cram-alarm.mp3`, and commit. Then the apps are rebuilt with it (the iPhone/iPad app builds by itself; the Android
and Windows apps with `npm run release`).
