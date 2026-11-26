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
2. `node build/pack-update.js` → `dist/app-<version>.mcupd`.
3. Create a GitHub release tagged `v<version>` and attach the `.mcupd` (and the installer when Electron or node modules change).

Installed apps check the latest release every 6 hours and install `.mcupd` updates themselves.
