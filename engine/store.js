// Game storage: one JSON file per game in <userData>/games, with an in-memory index.
const fs = require("fs");
const path = require("path");
const { findHighlights } = require("./highlights");

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.index = new Map(); // id -> summary
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try { const g = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); this.index.set(g.id, summary(g)); } catch {}
    }
  }
  save(game) {
    fs.writeFileSync(path.join(this.dir, game.id + ".json"), JSON.stringify(game));
    this.index.set(game.id, summary(game));
    return game.id;
  }
  remove(id) { try { fs.unlinkSync(path.join(this.dir, id + ".json")); } catch {} this.index.delete(id); }
  has(id) { return this.index.has(id); }
  list() { return [...this.index.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)); }
  get(id) {
    const f = path.join(this.dir, path.basename(String(id)) + ".json");
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  }
}

// The in-memory index keeps everything but the heavy per-frame lists, plus a few digests for
// the Matchups page (what kills you, what you kill with) and highlights for older games.
function summary(g) {
  const { stocks, conversions, ...rest } = g;
  let hl = g.highlights; if (!hl) { try { hl = findHighlights(g); } catch { hl = []; } }
  const killedBy = (stocks || []).filter((s) => s.lostBy === "ko").map((s) => s.killMove || "other");
  const killsWith = (conversions || []).filter((c) => c.side === "mine" && c.killed).map((c) => (c.moves && c.moves.length ? c.moves[c.moves.length - 1] : c.opener) || "other");
  return { ...rest, highlights: hl, killedBy, killsWith };
}

module.exports = { Store };
