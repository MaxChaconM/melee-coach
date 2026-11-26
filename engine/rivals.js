// Rivals of Aether II support (light mode): no per-frame analysis yet.
// - Replay headers (.rpl): stage, both characters, date, duration
// - Stats save (GVAS): per-character totals; diffing it after each game gives that game's
//   result, KOs, deaths, damage, parries and grabs.
const fs = require("fs");
const path = require("path");

const BASE = { Zet: "Zetterburn", For: "Forsburn", Eta: "Etalus", Oly: "Olympia", Lar: "La Reina", Lox: "Loxodont", Gal: "Galvan",
  Cla: "Clairen", Wra: "Wrastor", Kra: "Kragg", Ran: "Ranno", Orc: "Orcane", May: "Maypul", Abs: "Absa", Fle: "Fleet" };
// Common Workshop characters (code → name). Anything unknown keeps its code.
const MODS = { Cap: "Captain Falcon", Fox: "Fox", Marth: "Marth", Sheik: "Sheik", Gan: "Ganondorf", Wol: "Wolf", ZSS: "Zero Suit Samus",
  Falco: "Falco", Puff: "Jigglypuff", Peach: "Peach", Mario: "Mario", Luigi: "Luigi", Link: "Link", Sam: "Samus", Pika: "Pikachu" };

function charFromId(id) {
  // "Char_Zet" or "Mod_3815972334_Char_Cap" or stats keys "Zet" / "3815972334_Char_Cap" / "Random"
  const m = /(?:Mod_)?(\d+)?_?Char_(\w+)$/.exec(id);
  if (m) { const code = m[2]; const mod = !!m[1]; return { code, mod, name: (mod ? MODS[code] : BASE[code]) || MODS[code] || BASE[code] || code, key: mod ? `${m[1]}_Char_${code}` : code }; }
  return { code: id, mod: false, name: BASE[id] || id, key: id };
}
function prettyStage(s) {
  return s.replace(/^StageSkin_/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

// ---- replay header ----
function parseReplay(file) {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(4096); const n = fs.readSync(fd, buf, 0, 4096, 0); fs.closeSync(fd);
  const d = buf.subarray(0, n);
  if (d.toString("latin1", 9, 12) !== "LPR") return null;
  const startMs = d.readUInt32LE(12), endMs = d.readUInt32LE(16);
  const txt = d.toString("latin1");
  const stage = (/RivalsStageSkinData:(\w+)/.exec(txt) || [])[1] || "";
  const chars = [...txt.matchAll(/Rivals(?:Lua)?CharacterDefinition:(\w+)/g)].map((m) => charFromId(m[1]));
  const base = path.basename(file, ".rpl");
  // 2026-10-12_21-24-44-981-Player2(For)-Player1(Cap)-Game1
  const fm = /^(\d{4})-(\d\d)-(\d\d)_(\d\d)-(\d\d)-(\d\d)-\d+-(.+)-Game(\d+)$/.exec(base);
  if (!fm) return null;
  const slots = [...fm[7].matchAll(/Player(\d)\((\w+)\)/g)].map((m) => +m[1]);
  const startedAt = new Date(+fm[1], +fm[2] - 1, +fm[3], +fm[4], +fm[5], +fm[6]).toISOString();
  // header lists characters in the same order as the file name
  const players = chars.slice(0, slots.length).map((c, i) => ({ slot: slots[i], ...c }));
  return { id: base, file, startedAt, stage: prettyStage(stage), stageId: stage, players, gameIndex: +fm[8],
    durationSec: Math.max(0, (endMs - startMs) / 1000) };
}

// ---- stats save (GVAS) ----
// Token scan: the save is a list of *ByCharacter maps → character key → { ONLINE, LOCAL } floats.
function parseStats(file) {
  const d = fs.readFileSync(file);
  const tags = {}; let tag = null, stat = null, ch = null;
  let i = 0;
  const readStr = (p) => { const len = d.readInt32LE(p); if (len <= 0 || len > 200 || p + 4 + len > d.length) return null;
    const s = d.toString("latin1", p + 4, p + 4 + len - 1); return /^[\x20-\x7e]*$/.test(s) && d[p + 3 + len] === 0 ? [s, p + 4 + len] : null; };
  while (i < d.length - 5) {
    const r = readStr(i); if (!r) { i++; continue; }
    const [s, next] = r;
    if (s === "PlayerTagName") { // ... StrProperty, size, value
      const v = d.indexOf("StrProperty", next, "latin1"); let p = v + 12 + 9; const t = readStr(p);
      if (t) { tag = t[0]; tags[tag] ||= {}; i = t[1]; continue; }
    } else if (s !== "Values" && readStr(next)?.[0] === "MapProperty") { stat = s.replace(/ByCharacter$/, ""); if (tag) tags[tag][stat] ||= {}; }
    else if (s === "Random" || /^\w+$/.test(s) && (/_Char_/.test(s) || BASE[s] || s.length <= 5) && !/Property$|^None$|^Values$/.test(s)) { ch = s; }
    else if (s.startsWith("EGameModeType::") && tag && stat && ch && next + 4 <= d.length && d[next - 1] === 0 && s.length > 15) {
      const mode = s.slice(15); const v = d.readFloatLE(next);
      if (Number.isFinite(v)) { (tags[tag][stat][ch] ||= {})[mode] = v; }
      i = next + 4; continue;
    }
    i = next;
  }
  return tags;
}
// Main tag = the one with the most matches.
function mainTag(stats) {
  let best = null, n = -1;
  for (const [t, s] of Object.entries(stats)) { if (t === "ALL TAGS") continue; const m = Object.values(s.Matches || {}).reduce((a, x) => a + (x.ONLINE || 0) + (x.LOCAL || 0), 0); if (m > n) { n = m; best = t; } }
  return best;
}
function sumModes(x) { return x ? (x.ONLINE || 0) + (x.LOCAL || 0) : 0; }
// Difference between two snapshots for one tag → { char: { stat: delta } }
function diffStats(prev, cur, tag) {
  const out = {}; const a = prev?.[tag] || {}, b = cur?.[tag] || {};
  for (const stat of Object.keys(b)) for (const ch of Object.keys(b[stat] || {})) {
    const dv = sumModes(b[stat][ch]) - sumModes(a[stat]?.[ch]);
    if (Math.abs(dv) > 1e-6) (out[ch] ||= {})[stat] = dv;
  }
  return out;
}

class RivalsTracker {
  constructor({ userData, onChange, onNew, log = () => {} }) {
    this.onNew = onNew;
    this.dir = path.join(userData, "rivals"); fs.mkdirSync(this.dir, { recursive: true });
    this.dbFile = path.join(this.dir, "games.json"); this.snapFile = path.join(this.dir, "stats-snapshot.json");
    this.games = {}; try { this.games = JSON.parse(fs.readFileSync(this.dbFile, "utf8")); } catch {}
    this.snap = null; try { this.snap = JSON.parse(fs.readFileSync(this.snapFile, "utf8")); } catch {}
    this.onChange = onChange; this.log = log;
    const la = process.env.LOCALAPPDATA || path.join(require("os").homedir(), "AppData", "Local");
    this.root = path.join(la, "Rivals2", "Saved");
  }
  available() { return fs.existsSync(this.root); }
  save() { fs.writeFileSync(this.dbFile, JSON.stringify(this.games)); }
  stats() { try { return parseStats(path.join(this.root, "SaveGames", "Rivals2_StatsSaveSlot.sav")); } catch { return null; } }
  list() { return Object.values(this.games).filter((g) => !g.hidden).sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
  myChars(stats) {
    const tag = mainTag(stats || {}); const pt = stats?.[tag]?.PlaytimeInFrames || {};
    return Object.entries(pt).filter(([k]) => k !== "Random").sort((a, b) => sumModes(b[1]) - sumModes(a[1])).map(([k]) => k);
  }
  // Which player is you: the one on a character you actually play (by playtime); mirror → slot 1.
  pickMe(g, mine) {
    const rank = (p) => { const i = mine.indexOf(p.key); return i < 0 ? 999 : i; };
    if (g.players.length < 2) return 0;
    const [a, b] = g.players; if (a.key === b.key) return a.slot === 1 ? 0 : 1;
    return rank(a) <= rank(b) ? 0 : 1;
  }
  scan() {
    if (!this.available()) return 0;
    const dir = path.join(this.root, "Replays"); let added = 0;
    let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".rpl")); } catch { return 0; }
    const fresh = [];
    const stats = this.stats(); const mine = this.myChars(stats);
    for (const f of files) {
      const id = path.basename(f, ".rpl"); if (this.games[id]) continue;
      try {
        const g = parseReplay(path.join(dir, f)); if (!g) continue;
        const me = this.pickMe(g, mine); g.me = g.players[me]; g.opp = g.players[1 - me] || null;
        g.solo = g.players.length < 2; g.result = null; this.games[id] = g; added++; fresh.push(id);
      } catch (e) { this.log("[rivals] " + f + ": " + e.message); }
    }
    if (added) this.save();
    this.lastFresh = fresh;
    return added;
  }
  // Called when the stats save changes: attribute the difference to the newest unresolved game.
  statsChanged() {
    const cur = this.stats(); if (!cur) return;
    const tag = mainTag(cur); const prev = this.snap;
    this.snap = cur; fs.writeFileSync(this.snapFile, JSON.stringify(cur));
    if (!prev) return;
    const diff = diffStats(prev, cur, tag);
    const chars = Object.keys(diff).filter((c) => diff[c].Matches > 0);
    if (chars.length !== 1) return;
    this.scan();
    const ch = chars[0], dlt = diff[ch];
    const g = this.list().find((x) => !x.result && x.me?.key === ch && Date.now() - Date.parse(x.startedAt) < 30 * 60e3);
    if (!g) return;
    g.result = dlt.Wins > 0 ? "win" : dlt.Losses > 0 ? "loss" : null;
    g.mode = (cur[tag].Matches?.[ch]?.ONLINE || 0) > (prev[tag]?.Matches?.[ch]?.ONLINE || 0) ? "online" : "local";
    g.stats = { kos: dlt.KOs || 0, deaths: dlt.Deaths || 0, falls: dlt.Falls || 0, dmgDealt: dlt.DamageDealt || 0, dmgTaken: dlt.DamageTaken || 0,
      parryTry: dlt.ParryAttempts || 0, parryOk: dlt.ParrySuccesses || 0, grabTry: dlt.GrabAttempts || 0, grabOk: dlt.GrabSuccesses || 0 };
    this.save(); this.onChange && this.onChange();
  }
  setClip(id, file) { if (this.games[id]) { this.games[id].clip = file; this.save(); this.onChange && this.onChange(); } }
  hide(id) { if (this.games[id]) { this.games[id].hidden = true; this.save(); } }
  start() {
    if (!this.available()) return;
    this.scan(); if (!this.snap) this.statsChanged();
    const replays = path.join(this.root, "Replays"), saves = path.join(this.root, "SaveGames");
    let t1 = null, t2 = null;
    try { fs.watch(replays, () => { clearTimeout(t1); t1 = setTimeout(() => { if (this.scan()) { this.onChange && this.onChange();
      // only games that just finished (not old replays found at start-up)
      const recent = (this.lastFresh || []).filter((id) => Date.now() - Date.parse(this.games[id].startedAt) - this.games[id].durationSec * 1000 < 5 * 60e3);
      if (recent.length) this.onNew && this.onNew(recent); } }, 2000); }); } catch {}
    try { fs.watch(saves, (_e, f) => { if (!/Stats/.test(String(f))) return; clearTimeout(t2); t2 = setTimeout(() => this.statsChanged(), 2500); }); } catch {}
  }
}

module.exports = { parseReplay, parseStats, mainTag, charFromId, RivalsTracker, sumModes };
