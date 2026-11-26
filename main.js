// Melee Coach — Electron main process: window, tray, settings, live feed, replay import.
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Store } = require("./engine/store");
const { LiveFeed, listReplays, importFiles, expand } = require("./engine/feed");
const { ClipRenderer } = require("./engine/clips");

if (process.env.MC_USERDATA) app.setPath("userData", process.env.MC_USERDATA); // dev/testing only
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const USER = app.getPath("userData");
const CFG_FILE = path.join(USER, "config.json");
const DEFAULTS = {
  connectCode: "", myPort: null, host: "127.0.0.1", port: 51441,
  callouts: { lcancel: true, missedTech: true }, lcancelSuccessTick: false, voice: true, cueVolume: 0.6,
  uiScale: 1, closeToTray: true, startWithWindows: false,
  importFolders: [path.join(os.homedir(), "Downloads", "MeleeUnlocked-0.9.201-win64", "MeleeUnlocked-0.9.201", "Replays"),
                  path.join(os.homedir(), "Documents", "Slippi")],
  importSinceDays: 0,
  game: "melee", r2Notes: {}, clipsAuto: false, clipsFast: true, clipsPrep: true, clipsPrepGames: 10, clipsIdleMin: 5, updateRepo: "MaxChaconM/melee-coach", theme: "melee", obs: { enabled: false, host: "127.0.0.1", port: 4455, password: "", autoRivals: true }, clipsPerGame: 3, clipsKeepDays: 30, isoPath: "", playbackDolphinDir: "",
  targets: { lc: 80, tech: 20, opk: 5, dpo: 25, neutral: 55, gent: 80, knee: 70, ledge: 45, getup: 50 },
};
let cfg = loadConfig();
function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CFG_FILE, "utf8")); } catch {}
  // first run: pick up settings from the old command-line coach if it exists
  if (!fs.existsSync(CFG_FILE)) {
    try { const old = JSON.parse(fs.readFileSync(path.join(os.homedir(), "Documents", "Github", "melee-coach", "config.json"), "utf8"));
      c.connectCode = old.connectCode; } catch {}
  }
  if (!c.updateRepo) delete c.updateRepo; // empty means "use the default repository"
  return { ...DEFAULTS, ...c, callouts: { ...DEFAULTS.callouts, ...(c.callouts || {}) }, targets: { ...DEFAULTS.targets, ...(c.targets || {}) } };
}
function saveConfig() { fs.mkdirSync(USER, { recursive: true }); fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2)); }
const getCfg = () => cfg;

const store = new Store(path.join(USER, "games"));
const clips = new ClipRenderer({ userData: USER, ffmpeg: (() => { const v = path.join(__dirname, "vendor", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"); return fs.existsSync(v) ? v : path.join(USER, "bin", "ffmpeg.exe"); })(),
  getCfg: () => cfg, log: (m) => console.log(m),
  windowRect: () => { try { return require("electron").screen.getPrimaryDisplay().workArea; } catch { return null; } } });
clips.on((ev) => send("clip", ev));
// Whole matches are recorded once (in real time) and every event in the match plays from that one video.
// Recording waits until you take a break so Dolphin never pops up between games.
function requestMatch(g, bg = false) { return clips.request({ replay: g.file, gameId: g.id, frame: "full", end: Math.max(0, (g.durationFrames || 0) - 1), bg }); }
// Clip window around an event: 2.5 s before it, 2 s after it ends (same as Review asks for).
function clipRange(g, frame, end) { return { start: Math.max(-123, frame - 150), end: Math.min(Math.max(0, (g.durationFrames || 0) - 1), (end ?? frame) + 120) }; }
function requestEventClip(g, frame, end, bg = false) { return clips.request({ replay: g.file, gameId: g.id, frame, ...clipRange(g, frame, end), bg }); }
// While you're away: clips of the highlights and costly mistakes from your last 10 games only,
// so Review opens instantly without ever working through your whole history.
function queuePrepClips() {
  if (cfg.clipsPrep === false) return;
  for (const g of store.list().filter((x) => x.file).slice(0, cfg.clipsPrepGames ?? 10)) {
    if (clips.has(g.id, "full")) continue;
    const hl = (g.highlights || []).filter((h) => h.end && h.score >= 4).sort((a, b) => b.score - a.score).slice(0, 3);
    const ms = (g.moments || []).filter((m) => m.severity >= 2).slice(0, 3);
    for (const h of hl) requestEventClip(g, h.frame, h.end, true).catch(() => {});
    for (const m of ms) requestEventClip(g, m.frame, m.frame, true).catch(() => {});
  }
}
function queueAutoClips(sinceMs) {
  if (!cfg.clipsAuto) return;
  for (const g of store.list().filter((x) => x.file).slice(0, 5)) { // full matches: last 5 games at most
    if (Date.parse(g.startedAt) < sinceMs || clips.has(g.id, "full")) continue;
    requestMatch(g, true).catch(() => {});
  }
}
let inGame = false, idleTimer = null, recapTimer = null;
// End-of-session recap: 10 minutes after the last game, if the session had at least 3 games.
function scheduleRecap() {
  clearTimeout(recapTimer);
  recapTimer = setTimeout(() => {
    if (inGame) return;
    const list = store.list(); if (!list.length) return;
    const sess = [list[0]]; for (let i = 1; i < list.length; i++) { if (Date.parse(sess[sess.length - 1].startedAt) - Date.parse(list[i].startedAt) > 2 * 3600e3) break; sess.push(list[i]); }
    const real = sess.filter((g) => !g.vsCpu && g.complete !== false); if (real.length < 3) return;
    const w = real.filter((g) => g.result === "win").length, l = real.filter((g) => g.result === "loss").length;
    const lcOk = real.reduce((a, g) => a + (g.totals?.lcOk || 0), 0), lcT = real.reduce((a, g) => a + (g.totals?.lcTotal || 0), 0);
    const body = `${w}–${l} over ${real.length} games${lcT ? ` · L-cancels ${Math.round((100 * lcOk) / lcT)}%` : ""}. Click for your recap.`;
    send("recap", { at: new Date().toISOString() });
    try { const { Notification } = require("electron"); const n = new Notification({ title: "Session recap", body }); n.on("click", () => { if (win) { win.show(); win.focus(); send("goto", { view: "home" }); } }); n.show(); } catch {}
  }, (cfg.recapIdleMin ?? 10) * 60e3);
}
function holdClipsForPlay() { inGame = true; clearTimeout(idleTimer); clearTimeout(recapTimer); clips.pause(); }
function releaseClipsLater() {
  inGame = false; clearTimeout(idleTimer); clips.gameOver();
  idleTimer = setTimeout(() => { if (!inGame) { queuePrepClips(); clips.resume(); } }, (cfg.clipsIdleMin ?? 5) * 60e3);
}
let win = null, tray = null, quitting = false, feed = null;
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

// Audio cues are played by the window (Web Audio), so they keep working while it's hidden in the tray.
const audio = { play: (name) => send("cue", name), say: (text) => send("say", text) };

function createWindow(show = true) {
  win = new BrowserWindow({
    width: +(process.env.MC_W || 1440), height: +(process.env.MC_H || 920), minWidth: 720, minHeight: 560, show: false, backgroundColor: "#141518",
    title: "Melee Coach", icon: path.join(__dirname, "build", "icon.png"),
    titleBarStyle: "hidden", titleBarOverlay: { color: "#101113", symbolColor: "#a3a5ad", height: 40 },
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, "ui", "index.html"));
  win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(cfg.uiScale || 1));
  win.once("ready-to-show", () => { if (show) win.show(); });
  win.on("close", (e) => { if (!quitting && cfg.closeToTray) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  // Ctrl + / Ctrl - / Ctrl 0 change the UI scale
  win.webContents.on("before-input-event", (e, input) => {
    if (!input.control || input.type !== "keyDown") return;
    const k = input.key;
    if (k === "=" || k === "+") setScale((cfg.uiScale || 1) + 0.1);
    else if (k === "-") setScale((cfg.uiScale || 1) - 0.1);
    else if (k === "0") setScale(1);
    else return;
    e.preventDefault();
  });
}
function setScale(v) {
  cfg.uiScale = Math.round(Math.min(1.6, Math.max(0.7, v)) * 10) / 10; saveConfig();
  if (win) win.webContents.setZoomFactor(cfg.uiScale);
  send("config", cfg);
}
function showWindow() { if (!win) createWindow(); win.show(); if (win.isMinimized()) win.restore(); win.focus(); }

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png")).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Melee Coach");
  const menu = () => Menu.buildFromTemplate([
    { label: "Open Melee Coach", click: showWindow },
    { label: feed?.connected ? "● Connected to game" : "Waiting for game…", enabled: false },
    ...(pendingUpdate ? [{ label: `Restart to update (v${pendingUpdate.version})`, click: () => restartApp() }] : []),
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on("click", showWindow);
  return () => tray.setContextMenu(menu());
}

// ---------------------------------------------------------------- import
let importing = null;
async function runImport(folders, sinceDays) {
  if (importing) return importing;
  importing = (async () => {
    const files = folders.flatMap((f) => listReplays(f, sinceDays));
    const added = await importFiles(files, store, getCfg, (done, total, n) => send("import", { done, total, added: n }));
    send("import", { done: true, added }); if (added) send("games", {});
    importing = null; return added;
  })();
  return importing;
}

// ---------------------------------------------------------------- IPC
ipcMain.handle("games", () => store.list());
// ---- Rivals of Aether II (light mode)
const { RivalsTracker, mainTag } = require("./engine/rivals");
const { Obs } = require("./engine/obs");
const obs = new Obs({ getCfg: () => cfg, log: (m) => console.log(m) });
// After each Rivals 2 game, save OBS's replay buffer and attach the video to that game.
async function obsSaveFor(ids) {
  if (!cfg.obs?.enabled || cfg.obs?.autoRivals === false) return;
  try { const file = await obs.saveReplay(); if (file) for (const id of ids.slice(-1)) rivals.setClip(id, file); send("obs", { ok: true, file }); }
  catch (e) { console.log("[obs]", e.message); send("obs", { ok: false, error: e.message }); }
}
const rivals = new RivalsTracker({ userData: USER, onChange: () => send("r2", {}), onNew: (ids) => obsSaveFor(ids), log: (m) => console.log(m) });
ipcMain.handle("obsStatus", () => { obs.ready = null; try { obs.ws && obs.ws.close(); } catch {} return obs.status(); });
ipcMain.handle("obsSaveNow", async () => { try { const file = await obs.saveReplay(); const g = rivals.list()[0]; if (file && g) rivals.setClip(g.id, file); return { ok: true, file }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle("clipUrl", (_e, file) => (file && fs.existsSync(file) ? require("url").pathToFileURL(file).href : null));
ipcMain.handle("r2Data", () => {
  const stats = rivals.stats(); const tag = stats ? mainTag(stats) : null;
  return { available: rivals.available(), root: rivals.root, games: rivals.list(), stats: tag ? stats[tag] : null, tag, myChars: rivals.myChars(stats) };
});
ipcMain.handle("r2Hide", (_e, id) => { rivals.hide(id); return true; });
ipcMain.handle("game", (_e, id) => store.get(id));
ipcMain.handle("config", () => cfg);
ipcMain.handle("status", () => feed ? feed.state() : { connected: false, inGame: false });
ipcMain.handle("setConfig", (_e, patch) => {
  cfg = { ...cfg, ...patch, callouts: { ...cfg.callouts, ...(patch.callouts || {}) }, targets: { ...cfg.targets, ...(patch.targets || {}) } };
  saveConfig();
  if ("uiScale" in patch) setScale(cfg.uiScale);
  if ("startWithWindows" in patch) app.setLoginItemSettings({ openAtLogin: !!cfg.startWithWindows, args: ["--hidden"] });
  return cfg;
});
ipcMain.handle("pickFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("import", (_e, { folders, sinceDays } = {}) => runImport(folders || cfg.importFolders, sinceDays ?? cfg.importSinceDays));
ipcMain.handle("openReplay", (_e, file) => file && shell.showItemInFolder(file));
ipcMain.handle("clipInfo", (_e, { gameId, frame }) => {
  const has = clips.has(gameId, frame); const file = clips.clipPath(gameId, frame);
  const queued = clips.queue.some((j) => j.key === `${gameId}_${frame}`);
  return { has, url: has ? require("url").pathToFileURL(file).href + "?v=" + Math.round(fs.statSync(file).mtimeMs) : null, meta: has ? clips.meta(gameId, frame) : null, queued };
});
ipcMain.handle("renderClip", async (_e, { gameId, frame, end: _end }) => {
  const g = store.get(gameId);
  // you asked for it: it goes to the front of the queue and runs now (unless a game is live)
  try { await (frame === "full" ? requestMatch(g || { id: gameId }) : requestEventClip(g || { id: gameId }, frame, _end)); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("inputs", (_e, { gameId, start, end }) => {
  const g = store.get(gameId); if (!g?.file || !fs.existsSync(g.file)) return null;
  end = Math.min(end, start + 1500);
  try { return require("./engine/inputs").readInputs(g.file, { ...cfg, connectCode: g.myCode || cfg.connectCode }, start, end); } catch (e) { console.log("[inputs]", e.message); return null; }
});
ipcMain.handle("clipQueue", () => ({ pending: clips.queue.map((j) => j.key), busy: clips.busy, hold: clips.hold, inGame }));
ipcMain.handle("clipCheck", () => { const c = clips.check(); return { ok: c.ok, problems: c.problems, exe: c.exe, iso: c.iso, count: fs.readdirSync(clips.dir).filter((f) => f.endsWith(".mp4")).length, fastOk: !clips.fastBroken() }; });
ipcMain.handle("openClips", () => shell.openPath(clips.dir));

// ---------------------------------------------------------------- live updates
// Updates arrive as changed files in this folder. Watch it, tell the UI while files are landing,
// then offer a restart (never forced, and held back while a game is being played).
let pendingUpdate = null;
function readPkg() { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")); } catch { return {}; } }
function readVersion() { return readPkg().version || app.getVersion(); }
// Updates always write package.json last, so only that file signals "update finished".
// One notice per new version, never for a version that's already running or already announced.
let announced = null;
function announceUpdate() {
  const pk = readPkg(); const v = pk.version;
  if (!v || v === app.getVersion() || v === announced) return;
  announced = v; pendingUpdate = { version: v, notes: pk.notes || [] };
  send("update", { state: "ready", ...pendingUpdate });
  if (!win || !win.isVisible()) {
    try { const { Notification } = require("electron"); const n = new Notification({ title: `Melee Coach ${v} is ready`, body: "Click to restart and use the new version." }); n.on("click", restartApp); n.show(); } catch {}
  }
  refreshTrayMenu && refreshTrayMenu();
}
function watchForUpdates() {
  let timer = null;
  try {
    fs.watch(__dirname, { recursive: true }, (_ev, file) => {
      // the GitHub updater writes package.json.new and renames it, so accept both names
      if (!file || !/^package\.json(\.new)?$/.test(path.basename(String(file))) || /node_modules/.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(announceUpdate, 3000);
    });
  } catch (e) { console.log("[update] can't watch app folder:", e.message); }
}
function restartApp() {
  quitting = true;
  app.relaunch({ args: process.argv.slice(1).filter((a) => a !== "--hidden") });
  app.exit(0);
}
let refreshTrayMenu = null;
ipcMain.handle("restartApp", () => restartApp());
ipcMain.handle("pendingUpdate", () => pendingUpdate);
ipcMain.handle("justUpdated", () => {
  const v = app.getVersion(), prev = cfg.lastVersion; if (prev !== v) { cfg.lastVersion = v; saveConfig(); }
  return { from: prev && prev !== v ? prev : null, to: v, notes: readPkg().notes || [] };
});

// ---------------------------------------------------------------- re-analysis
// Games analysed by an older version are re-read from their replay in the background
// (v2 records every move in each combo, which the highlights and Matchups page use).
const ANALYSIS_V = 3; // v3: opponent habits for the opponent notes
async function upgradeOldGames() {
  const old = store.list().filter((g) => g.file && (g.v || 1) < ANALYSIS_V && fs.existsSync(g.file)).map((g) => g.file);
  if (!old.length) return;
  await importFiles(old, store, getCfg, (done, total) => send("import", { done, total, label: "Updating older games" }), { force: true });
  send("import", { done: true, added: 0, label: "Older games updated" }); send("games", {});
}

// ---------------------------------------------------------------- GitHub updates
async function checkGithubUpdate(manual) {
  if (!cfg.updateRepo) return { state: "off" };
  try {
    const r = await require("./engine/updater").checkAndApply({ repo: cfg.updateRepo, current: readVersion(), appDir: __dirname, log: (m) => console.log(m) });
    if (r.state === "installer") send("update", { state: "installer", version: r.version, url: r.url });
    if (r.state === "applied" || r.state === "current") announceUpdate(); // don't rely on the folder watcher for our own writes
    return r;
  } catch (e) { console.log("[update]", e.message); return { state: "error", error: e.message }; }
}
ipcMain.handle("checkUpdate", () => checkGithubUpdate(true));
ipcMain.handle("openExternal", (_e, url) => { if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url); });

// ---------------------------------------------------------------- old installers
// The installer already removes the previous app version. This removes the setup .exe files
// left behind in the usual download spots once a newer (or the same) version is running.
function cleanOldInstallers() {
  if (!app.isPackaged) return;
  const cur = app.getVersion().split(".").map(Number);
  const older = (v) => { const a = v.split(".").map(Number); for (let i = 0; i < 3; i++) if (a[i] !== cur[i]) return a[i] < cur[i]; return true; };
  const home = app.getPath("home");
  const dirs = [app.getPath("downloads"), app.getPath("desktop"), path.join(home, "Documents", "Github", "melee-coach"), path.join(home, "Documents", "Github", "melee-coach-app"), path.join(home, "Documents", "Github", "melee-coach-app", "install")];
  const removed = [];
  for (const d of dirs) {
    let list = []; try { list = fs.readdirSync(d); } catch { continue; }
    for (const f of list) {
      const m = /^Melee Coach Setup (\d+\.\d+\.\d+)(?: \(\d+\))?\.exe(\.blockmap)?$/i.exec(f);
      if (!m || !older(m[1])) continue;
      try { fs.unlinkSync(path.join(d, f)); removed.push(f); } catch {} // still running → try next launch
    }
  }
  if (removed.length) console.log("[cleanup] removed old installers:", removed.join(", "));
}

// ---------------------------------------------------------------- start
app.whenReady().then(() => {
  app.setAppUserModelId("com.maxchacon.meleecoach");
  createWindow(!process.argv.includes("--hidden"));
  const refreshTray = createTray(); refreshTrayMenu = refreshTray;
  try { rivals.start(); } catch (e) { console.log("[rivals]", e.message); }
  watchForUpdates();
  feed = new LiveFeed(getCfg, audio, {
    status: (s) => { send("status", s); refreshTray(); },
    connected: () => { if (cfg.voice) audio.say("Coach connected."); },
    gameStart: (meta) => { holdClipsForPlay(); send("gameStart", meta); },
    live: (snap) => send("live", snap),
    gameEnd: (g) => {
      if (g.durationFrames >= 60 * 20) { store.save(g); send("gameEnd", { id: g.id }); }
      // swap in the replay file once the game has written it, then render clips of the costly moments
      releaseClipsLater(); scheduleRecap();
      setTimeout(() => runImport(cfg.importFolders, 1).then(() => queueAutoClips(Date.now() - 6 * 3600e3)), 5000);
    },
  });
  feed.connect();
  if (process.env.MC_SHOT) require("./build/" + "shots")(win, process.env.MC_SHOT); // dev/testing only (file not shipped)
  setTimeout(() => runImport(cfg.importFolders, cfg.importSinceDays).then(upgradeOldGames), 1500);
  setTimeout(() => clips.prune(cfg.clipsKeepDays), 10000);
  releaseClipsLater(); // background clip prep starts once the app has been idle for a while
  setTimeout(() => checkGithubUpdate(false), 30000); setInterval(() => checkGithubUpdate(false), 6 * 3600e3);
  setTimeout(cleanOldInstallers, 20000); // give the setup .exe time to exit after launching us
});
app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => { if (!cfg.closeToTray) app.quit(); });
