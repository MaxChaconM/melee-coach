// Live Slippi feed + replay import. Turns frames into finished games via GameCoach.
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  DolphinConnection, ConnectionEvent, ConnectionStatus,
  SlpStream, SlpStreamEvent, SlpStreamMode, SlpParser, SlpParserEvent, Command,
} = require("@slippi/slippi-js/node");
const { GameCoach } = require("./coach");
const { findMoments } = require("./moments");
const { findHighlights } = require("./highlights");

const norm = (c) => (c || "").replace("＃", "#").toUpperCase();
const expand = (p) => path.normalize(p.replace(/^~/, os.homedir()).replace(/%USERPROFILE%/gi, os.homedir()));
const quiet = { play() {}, say() {} };

function pickMe(settings, cfg) {
  const players = settings.players.filter((p) => p.type !== 3 && p.characterId !== null && p.characterId !== undefined);
  if (players.length !== 2) return null;
  let me = players.find((p) => norm(p.connectCode) && norm(p.connectCode) === norm(cfg.connectCode));
  if (!me && cfg.myPort) me = players.find((p) => p.playerIndex === cfg.myPort - 1);
  if (!me) { const f = players.filter((p) => p.characterId === 0); if (f.length === 1) me = f[0]; }
  if (!me) me = players.find((p) => p.playerIndex === 0) || players[0];
  return { me, opp: players.find((p) => p !== me) };
}

function pipeline(getCfg, audio, { meta = {}, onGame, onFrame, onStart }) {
  const stream = new SlpStream({ mode: SlpStreamMode.AUTO, suppressErrors: true });
  const parser = new SlpParser();
  let game = null;
  stream.on(SlpStreamEvent.COMMAND, ({ command, payload }) => {
    if (command === Command.MESSAGE_SIZES) { parser.reset(); game = null; }
    parser.handleCommand(command, payload);
  });
  parser.on(SlpParserEvent.SETTINGS, (settings) => {
    const cfg = getCfg(); const pick = pickMe(settings, cfg);
    game = pick ? new GameCoach(settings, pick.me, pick.opp, cfg, audio, { ...meta }) : null;
    if (game && onStart) onStart(game);
  });
  parser.on(SlpParserEvent.FINALIZED_FRAME, (fr) => { if (game) { game.frame(fr); onFrame && onFrame(game); } });
  parser.on(SlpParserEvent.END, (end) => {
    if (!game) return;
    const g = game.end(end); game = null;
    g.moments = findMoments(g);
    g.highlights = findHighlights(g);
    onGame(g);
  });
  return stream;
}

function readRaw(file) {
  const buf = fs.readFileSync(file);
  return buf.subarray(15, 15 + buf.readUInt32BE(11)); // .slp = UBJSON {"raw":[$U#l<len> ...}
}

function startFromFilename(file) {
  const m = path.basename(file).match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date(fs.statSync(file).mtimeMs).toISOString();
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString();
}

function analyzeFile(file, getCfg) {
  let out = null;
  const stream = pipeline(getCfg, quiet, {
    meta: { startedAt: startFromFilename(file), file, id: path.basename(file, ".slp") },
    onGame: (g) => { out = g; },
  });
  const log = console.log; console.log = () => {};
  try { const raw = readRaw(file); for (let i = 0; i < raw.length; i += 1 << 16) stream.process(raw.subarray(i, i + (1 << 16))); }
  catch { out = null; } finally { console.log = log; }
  return out && out.durationFrames >= 60 * 20 ? out : null;
}

function listReplays(folder, sinceDays) {
  folder = expand(folder);
  if (!fs.existsSync(folder)) return [];
  const cutoff = sinceDays ? Date.now() - sinceDays * 864e5 : 0;
  const files = [];
  const walk = (d) => {
    let entries = []; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".slp")) { try { if (fs.statSync(p).mtimeMs >= cutoff) files.push(p); } catch {} }
    }
  };
  walk(folder);
  return files.sort();
}

// Imports on a worker thread so the app stays responsive. onProgress(done, total, added).
function importFiles(files, store, getCfg, onProgress, { force = false } = {}) {
  const { Worker } = require("worker_threads");
  return new Promise((resolve) => {
    const todo = force ? files : files.filter((f) => !store.has(path.basename(f, ".slp")));
    if (!todo.length) { onProgress && onProgress(0, 0, 0); return resolve(0); }
    let done = 0, added = 0;
    const w = new Worker(path.join(__dirname, "importWorker.js"), { workerData: { files: todo, cfg: getCfg() } });
    w.on("message", (m) => {
      if (m.done) { w.terminate(); return resolve(added); }
      done++;
      const g = m.game;
      if (g) {
        // a live-recorded copy of the same game gets replaced by the replay version
        for (const s of store.list()) if (!s.file && s.oppChar === g.oppChar && Math.abs(Date.parse(s.startedAt) - Date.parse(g.startedAt)) < 120000) store.remove(s.id);
        store.save(g); added++;
      }
      if (done % 5 === 0 || done === todo.length) onProgress && onProgress(done, todo.length, added);
    });
    w.on("error", () => resolve(added));
  });
}

class LiveFeed {
  constructor(getCfg, audio, handlers) {
    this.getCfg = getCfg; this.h = handlers; this.connected = false; this.inGame = false;
    let last = 0;
    this.stream = pipeline(getCfg, audio, {
      onStart: (game) => handlers.gameStart && handlers.gameStart(game.meta),
      onFrame: (game) => { const n = Date.now(); if (n - last > 200) { last = n; handlers.live(game.snapshot()); } },
      onGame: (g) => { this.inGame = false; handlers.status(this.state()); handlers.gameEnd(g); },
    });
    this.conn = new DolphinConnection();
    this.conn.on(ConnectionEvent.STATUS_CHANGE, (s) => {
      const was = this.connected; this.connected = s === ConnectionStatus.CONNECTED;
      if (!this.connected) this.inGame = false;
      if (was !== this.connected) handlers.status(this.state());
      if (this.connected && !was && handlers.connected) handlers.connected();
      if (s === ConnectionStatus.DISCONNECTED) setTimeout(() => this.connect(), 3000);
    });
    this.conn.on(ConnectionEvent.DATA, (d) => {
      if (!this.inGame) { this.inGame = true; handlers.status(this.state()); }
      this.stream.process(d);
    });
    this.conn.on(ConnectionEvent.ERROR, () => {});
  }
  state() { return { connected: this.connected, inGame: this.inGame }; }
  connect() { const c = this.getCfg(); this.conn.connect(c.host, c.port).catch(() => {}); }
}

module.exports = { LiveFeed, listReplays, importFiles, analyzeFile, expand, pickMe };
