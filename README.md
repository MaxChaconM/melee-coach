# Melee Coach

Desktop coach for Super Smash Bros. Melee (Slippi) with a light mode for Rivals of Aether II.

- Live cues during games (missed L-cancels, missed techs), session recaps, weekly training plan
- Replay review with rendered clips, an input timeline, highlights and matchup notes
- Rivals 2: stats from the game's save data, OBS replay-buffer clips

## Develop
```
npm install
npx electron .
```
`vendor/ffmpeg.exe` (not in git) is bundled into the installer; without it the app downloads ffmpeg on first clip render.

## Release
1. Bump `version` and `notes` in package.json.
2. `node build/pack-update.js` writes `updates/latest.json` and `updates/app-<version>.mcupd`.
   Set `NEEDS_INSTALLER=1` when Electron or node modules changed; installed apps then point to the Releases page instead.
3. Commit and push to `main`.

Installed apps read `updates/latest.json` from `main` every 6 hours (and from Settings → Updates → Check now) and install the update themselves.
