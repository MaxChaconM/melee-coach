// Frame-by-frame inputs and action states for your port, read from the replay on demand
// (only for the stretch of the match being watched). Used by the input timeline under clips.
const { SlippiGame } = require("@slippi/slippi-js/node");
const { pickMe } = require("./feed");

const cache = new Map(); // file -> { idx, frames } (last 3 games)

function load(file, cfg) {
  if (cache.has(file)) { const v = cache.get(file); cache.delete(file); cache.set(file, v); return v; }
  const game = new SlippiGame(file);
  const settings = game.getSettings();
  const pick = pickMe(settings, cfg);
  const v = { idx: pick && pick.me ? pick.me.playerIndex : 0, frames: game.getFrames() || {} };
  cache.set(file, v); if (cache.size > 3) cache.delete(cache.keys().next().value);
  return v;
}

// Returns compact per-frame arrays for start..end (inclusive).
function readInputs(file, cfg, start, end) {
  const { idx, frames } = load(file, cfg);
  const n = Math.max(0, end - start + 1);
  const out = { start, n, btn: new Array(n).fill(0), lt: new Array(n).fill(0), rt: new Array(n).fill(0),
    sy: new Array(n).fill(0), sx: new Array(n).fill(0), act: new Array(n).fill(-1), air: new Array(n).fill(0) };
  for (let i = 0; i < n; i++) {
    const fr = frames[start + i]; const p = fr && fr.players && fr.players[idx];
    if (!p) continue;
    const pre = p.pre || {}, post = p.post || {};
    out.btn[i] = pre.physicalButtons || 0;
    out.lt[i] = Math.round((pre.physicalLTrigger || 0) * 100);
    out.rt[i] = Math.round((pre.physicalRTrigger || 0) * 100);
    out.sx[i] = Math.round((pre.joystickX || 0) * 100);
    out.sy[i] = Math.round((pre.joystickY || 0) * 100);
    out.act[i] = post.actionStateId ?? -1;
    out.air[i] = post.isAirborne ? 1 : 0;
  }
  return out;
}

module.exports = { readInputs };
