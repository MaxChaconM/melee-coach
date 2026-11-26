// Character art from the player's own Dolphin texture packs (Melee HD, Animelee, …).
// Nothing is converted or bundled: we find a folder named after the character inside a pack's
// "portraits" folder and hand the PNG to the UI. If no pack has one, the UI shows its own badge.
const fs = require("fs");
const path = require("path");

const norm = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
// app names (Falcon, DK, Puff…) and pack folder names (Captain Falcon, Donkey Kong, Jigglypuff…) → one key
const ALIAS = { captainfalcon: "falcon", cfalcon: "falcon", donkeykong: "dk", jigglypuff: "puff", jiggs: "puff", drmario: "doc", doctormario: "doc",
  ganondorf: "ganon", mrgameandwatch: "gameandwatch", gnw: "gameandwatch", gw: "gameandwatch", popo: "iceclimbers", nana: "iceclimbers", ics: "iceclimbers", ylink: "younglink", yl: "younglink" };
const key = (s) => { const n = norm(s); return ALIAS[n] || n; };

function roots(extra = []) {
  const app = process.env.APPDATA || "";
  return [
    path.join(app, "Slippi Launcher", "netplay", "User", "Load", "Textures"),
    path.join(app, "Slippi Launcher", "playback", "User", "Load", "Textures"),
    ...extra,
  ].filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}

function packName(dir) {
  const hay = [dir];
  for (const f of ["credits.txt", "readme.txt", "README.txt", "Readme.txt"]) { try { hay.push(fs.readFileSync(path.join(dir, f), "utf8").slice(0, 4000)); } catch {} }
  const t = hay.join(" ").toLowerCase();
  if (/ball\s*z|animelee\s*z|dbz/.test(t)) return "Animelee Ball Z";
  if (/animelee/.test(t)) return "Animelee";
  if (/melee\s*hd/.test(t)) return "Melee HD";
  return path.basename(dir);
}

let cache = null; // { at, chars: { key: [{ file, w, h }] }, pack }
function scan(extra) {
  if (cache && Date.now() - cache.at < 10 * 60e3) return cache;
  const chars = {}; let pack = null;
  const walk = (dir, depth, packDir) => {
    if (depth > 7) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (/^portraits?$/i.test(e.name) || /^csp/i.test(e.name)) {
        for (const c of fs.readdirSync(p, { withFileTypes: true })) {
          if (!c.isDirectory()) continue;
          const imgs = [];
          for (const f of fs.readdirSync(path.join(p, c.name))) {
            const m = /^tex1_(\d+)x(\d+)_.*\.png$/i.exec(f) || (/\.png$/i.test(f) ? [null, 0, 0] : null);
            if (m) imgs.push({ file: path.join(p, c.name, f), w: +m[1], h: +m[2] });
          }
          if (!imgs.length) continue;
          // the big character-select portraits (136x188 in vanilla), not the small 64x56 ones
          const big = Math.max(...imgs.map((i) => i.w * i.h));
          const k = key(c.name.replace(/\(.*\)/, ""));
          if (!chars[k]) chars[k] = imgs.filter((i) => i.w * i.h === big).sort((a, b) => a.file.localeCompare(b.file));
          pack ||= packName(packDir);
        }
      } else walk(p, depth + 1, depth === 0 ? p : packDir);
    }
  };
  for (const r of roots(extra)) walk(r, 0, r);
  cache = { at: Date.now(), chars, pack };
  return cache;
}

function charArt(char, index = 0, extra) {
  const s = scan(extra); const list = s.chars[key(char)] || [];
  if (!list.length) return { found: false, pack: s.pack };
  const i = ((index % list.length) + list.length) % list.length;
  try { return { found: true, pack: s.pack, count: list.length, index: i, data: "data:image/png;base64," + fs.readFileSync(list[i].file).toString("base64") }; }
  catch { return { found: false, pack: s.pack }; }
}

module.exports = { charArt, scan, key };
