/* Melee Coach — renderer. Views: home, games, review, progress, settings. */
window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(e.message)); window.addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason)));
const api = window.coach;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ------------------------------------------------------------------ helpers
const CHIP = { Falcon:"#e85d3a", Fox:"#d8a24a", Falco:"#5b8def", Marth:"#6c74d9", Sheik:"#8aa6c8", Puff:"#f2a7c9", Peach:"#f5b3c8",
  "Ice Climbers":"#8ecdf2", Samus:"#e0864a", Zelda:"#c79bd8", Ganon:"#8a6aa8", Doc:"#e9e9e9", Mario:"#e95d5d", Luigi:"#5ec26a",
  Pikachu:"#f4d44d", Yoshi:"#7ed46c", DK:"#a67445", Link:"#79b86a", "Young Link":"#9ad08a", Roy:"#d9645a", Mewtwo:"#b49ad6",
  "Game & Watch":"#bbbbbb", Ness:"#e06b6b", Kirby:"#f4a8c8", Bowser:"#8fbf5a", Pichu:"#f6dd73" };
const initials = (n) => (n || "?").split(/[\s&]+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const chip = (name, size = 30) => `<span class="chip" style="width:${size}px;height:${size}px;background:${CHIP[name] || "#999"}">${esc(initials(name))}</span>`;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const fmt = (v, unit = "") => (v === null || v === undefined || Number.isNaN(v) ? "–" : `${v}${unit}`);
const dur = (f) => { const s = Math.round(f / 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const when = (iso) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso) => new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const maxShare = (o) => { const v = Object.values(o || {}); const t = v.reduce((a, b) => a + b, 0); return t >= 3 ? Math.round((100 * Math.max(...v)) / t) : null; };
const topKey = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
const mergeObj = (list) => list.reduce((a, o) => { for (const [k, v] of Object.entries(o || {})) a[k] = (a[k] || 0) + v; return a; }, {});
const toneColor = { good: "var(--teal)", mid: "var(--yellow)", bad: "var(--red)", muted: "var(--muted)" };
const sevTag = (m) => (m.severity >= 3 ? "red" : m.severity === 2 ? "yellow" : "teal");

// ------------------------------------------------------------------ metrics
// Aggregated over game summaries (s.totals), or over raw stocks/conversions for one game.
const METRICS = [
  { key: "lc", name: "L-cancel rate", unit: "%", good: "up", get: (t) => pct(t.lcOk, t.lcTotal), min: (t) => t.lcTotal >= 3,
    why: "Missed L-cancels double your landing lag — that's what gets you grabbed and punished on shield.",
    drill: "Lab: bair onto Battlefield's side platform and aim for 5 L-cancels in a row." },
  { key: "tech", name: "Missed techs", unit: "%", good: "down", get: (t) => pct(t.missedTechs, t.techs), min: (t) => t.techs >= 3,
    why: "Every missed tech gives the opponent a free tech-chase or jab reset.",
    drill: "Lab: set the CPU to throw you and tech every landing — mix in place, left and right." },
  { key: "opk", name: "Openings per kill", unit: "", good: "down", get: (t) => (t.kills ? +(t.openings / t.kills).toFixed(1) : null), min: (t) => t.kills >= 1,
    why: "How many times you have to win neutral to take a stock. Lower means your punishes convert.",
    drill: "Lab: practice uthrow/dthrow → knee follow-ups on a DI-ing CPU at 60–100%." },
  { key: "dpo", name: "Damage per opening", unit: "%", good: "up", get: (t) => (t.openings ? Math.round(t.dmgOpen / t.openings) : null), min: (t) => t.openings >= 3,
    why: "How much each won interaction is worth. Short punishes leave stocks on the table.",
    drill: "Lab: nair → grab and uair strings on a CPU; extend each opening by one more hit." },
  { key: "neutral", name: "Neutral win rate", unit: "%", good: "up", get: (t) => pct(t.openings, t.openings + t.oppOpenings), min: (t) => t.openings + t.oppOpenings >= 6,
    why: "Share of all openings in the game that were yours.",
    drill: "Unranked: play for first hit only — reset to center after every opening." },
  { key: "gent", name: "Gentleman rate", unit: "%", good: "up", get: (t) => pct(t.gentlemen, t.jab3), min: (t) => t.jab3 >= 2,
    why: "Jab strings that finished as a gentleman instead of turning into rapid jab.",
    drill: "Lab: 20 gentlemen in a row, slow third press, no mashing." },
  { key: "knee", name: "Knee sweetspot rate", unit: "%", good: "up", get: (t) => pct(t.sweetKnees, t.knees), min: (t) => t.knees >= 2,
    why: "Sweetspot knees kill; sourspots are 6% and leave you open.",
    drill: "Lab: knee a standing CPU and only count sweetspots (big hit, lightning sound)." },
  { key: "ledge", name: "Ledge predictability", unit: "%", good: "down", get: (t) => maxShare(t.ledge), min: (t) => Object.values(t.ledge || {}).reduce((a, b) => a + b, 0) >= 3,
    why: "Share of your ledge options that were the same one. High = easy to read.",
    drill: "Lab: ledgedash 10 times in a row, then mix getup / jump / ledgedash." },
  { key: "getup", name: "Getup predictability", unit: "%", good: "down", get: (t) => maxShare(t.getups), min: (t) => Object.values(t.getups || {}).reduce((a, b) => a + b, 0) >= 3,
    why: "Share of your getups (after a missed tech) that were the same option.",
    drill: "Be honest with yourself: roll, stand and getup attack — never the same one twice." },
];
const metric = (k) => METRICS.find((m) => m.key === k);
const target = (m) => cfg.targets?.[m.key];
const score = (m, v) => { const t = target(m); return v === null || v === undefined ? null : m.good === "up" ? (v - t) / t : (t - v) / Math.max(t, 1); };
const tone = (m, v) => { const s = score(m, v); return s === null ? "muted" : s >= 0 ? "good" : s > -0.35 ? "mid" : "bad"; };
const metricVals = (t) => Object.fromEntries(METRICS.map((m) => [m.key, m.min(t) ? m.get(t) : null]));

function aggSummaries(list) {
  const t = { lcOk: 0, lcTotal: 0, lcEarly: 0, lcLate: 0, lcNone: 0, techs: 0, missedTechs: 0, jab3: 0, gentlemen: 0, knees: 0, sweetKnees: 0,
    openings: 0, oppOpenings: 0, kills: 0, deaths: 0, dmgOpen: 0 };
  for (const g of list) { const x = g.totals; for (const k of Object.keys(t)) if (k !== "dmgOpen") t[k] += x[k] || 0;
    t.dmgOpen += (x.dmgPerOpening || 0) * (x.openings || 0); }
  t.ledge = mergeObj(list.map((g) => g.totals.ledge)); t.getups = mergeObj(list.map((g) => g.totals.getups));
  return t;
}
function totalsFrom(stocks, conv) {
  const land = stocks.flatMap((s) => s.landings);
  const sum = (k) => stocks.reduce((a, s) => a + (s[k] || 0), 0);
  const mine = conv.filter((c) => c.side === "mine"), theirs = conv.filter((c) => c.side === "theirs");
  return { land, lcOk: land.filter((x) => x.ok).length, lcTotal: land.length, techs: sum("techs"), missedTechs: sum("missedTechs"),
    jab3: sum("jab3"), gentlemen: sum("gentlemen"), rapid: sum("rapid"), knees: sum("knees"), sweetKnees: sum("sweetKnees"),
    dmgDealt: sum("dmgDealt"), dmgTaken: sum("dmgTaken"), openings: mine.length, oppOpenings: theirs.length,
    kills: sum("kills"), deaths: stocks.filter((s) => s.lostBy === "ko").length, convKills: mine.filter((c) => c.killed).length,
    dmgOpen: mine.reduce((a, c) => a + c.damage, 0), mine, theirs,
    getups: mergeObj(stocks.map((s) => s.getups)), ledge: mergeObj(stocks.map((s) => s.ledge)), tech: mergeObj(stocks.map((s) => s.tech)) };
}
function sessions(list) {
  const asc = [...list].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  const out = [];
  for (const g of asc) {
    const last = out[out.length - 1];
    if (last && Date.parse(g.startedAt) - Date.parse(last.games[last.games.length - 1].startedAt) < 2 * 3600e3) last.games.push(g);
    else out.push({ games: [g] });
  }
  for (const s of out) { s.start = s.games[0].startedAt; s.end = s.games[s.games.length - 1].startedAt; }
  return out; // oldest first
}
const record = (list) => ({ w: list.filter((g) => g.result === "win").length, l: list.filter((g) => g.result === "loss").length });

function gauge(v, color, w = 96) {
  const c = Math.PI * 34, f = v === null ? 0 : Math.max(0.02, Math.min(1, v / 100));
  return `<svg width="${w}" height="${w * 0.6}" viewBox="0 0 96 58" role="img" aria-label="${v === null ? "no data" : v + " percent"}">
    <path d="M14 50 A34 34 0 0 1 82 50" fill="none" stroke="#2e2f35" stroke-width="9" stroke-linecap="round"/>
    <path d="M14 50 A34 34 0 0 1 82 50" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * f} ${c}"/>
    <text x="48" y="53" text-anchor="middle" font-size="19" font-weight="700" fill="${color}" font-family="Segoe UI, sans-serif">${v === null ? "–" : v + "%"}</text></svg>`;
}
function bars(obj) {
  const tot = Object.values(obj || {}).reduce((a, b) => a + b, 0);
  if (!tot) return '<div class="sub">None yet.</div>';
  return `<div class="bars">${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<div class="row"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${(100 * v) / tot}%"></div></div><span class="sub">${v}</span></div>`).join("")}</div>`;
}

// ------------------------------------------------------------------ state
let cfg = {}, games = [], status = { connected: false, inGame: false }, liveSnap = null;
let view = "home";
const ui = { gameId: null, stock: "all", tab: "improve", metric: null, open: {}, momentKey: null, filter: "all", progMetric: "lc" };
const cache = new Map();
async function loadGame(id) { if (!cache.has(id)) cache.set(id, await api.game(id)); return cache.get(id); }

async function refresh() { games = await api.games(); render(); updateStatusBar(); }
function go(v, opts = {}) { view = v; Object.assign(ui, opts); $$(".rail button").forEach((b) => b.classList.toggle("on", b.dataset.view === v)); render(); $("#content").scrollTop = 0; }
$$(".rail button").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));

function liveStrip() {
  if (!status.inGame || !liveSnap) return "";
  const s = liveSnap; const lc = pct(s.lcStock.ok, s.lcStock.total), lcg = pct(s.lcGame.ok, s.lcGame.total);
  return `<div class="live"><span class="t">LIVE</span>
    <div><label>${esc(s.meta.myChar)} vs ${esc(s.meta.oppChar)}</label><b>${s.me?.stocks ?? "–"} – ${s.opp?.stocks ?? "–"}</b> <span class="sub">${s.me?.percent ?? 0}% / ${s.opp?.percent ?? 0}%</span></div>
    <div><label>L-cancels this stock</label><b>${s.lcStock.ok}/${s.lcStock.total}</b> <span class="sub">${fmt(lc, "%")}</span></div>
    <div><label>This game</label><b>${fmt(lcg, "%")}</b></div>
    <div><label>Missed techs</label><b>${s.missedTechs}/${s.techs}</b></div>
    <div><label>Gentlemen</label><b>${s.gentlemen}/${s.jab3}</b></div></div>`;
}
const statusPill = () => `<span class="pill ${status.connected ? "on" : ""}"><span class="dot"></span>${status.connected ? (status.inGame ? "Live" : "Connected") : "Waiting for game"}</span>`;

function applyRail() {
  const c = !!cfg.railCollapsed; document.body.classList.toggle("rail-min", c);
  const b = $("#burger"); if (b) { b.setAttribute("aria-expanded", String(!c)); b.setAttribute("aria-label", c ? "Expand menu" : "Collapse menu"); b.title = (c ? "Expand menu" : "Collapse menu") + " (Ctrl+B)"; }
  $$(".rail button").forEach((x) => { x.title = c ? x.textContent.trim() : ""; });
}
async function toggleRail() { cfg = await api.setConfig({ railCollapsed: !cfg.railCollapsed }); applyRail(); }
document.addEventListener("click", (e) => { if (e.target.closest("#burger")) toggleRail(); });
document.addEventListener("keydown", (e) => { if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); toggleRail(); } });
function applyGame() {
  applyRail();
  const rv = cfg.game === "rivals";
  $$(".gswitch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.game === (cfg.game || "melee"))));
  $$('.rail [data-view="review"], .rail [data-view="progress"], .rail [data-view="highlights"]').forEach((b) => (b.hidden = rv));
  $(".titlebar b").textContent = rv ? "Rivals Coach" : "Melee Coach";
  document.body.classList.toggle("is-rivals", rv);
  document.body.classList.toggle("theme-melee", (cfg.theme || "melee") === "melee");
  $("#sbConn").hidden = rv;
  if (rv && r2) $("#sbGames").textContent = `${r2.games.length} Rivals 2 game${r2.games.length === 1 ? "" : "s"}`;
  if (rv && (view === "review" || view === "progress" || view === "highlights")) view = "home";
}
function render() {
  const el = $("#content");
  applyGame();
  if (cfg.game === "rivals" && view !== "settings") {
    el.innerHTML = view === "games" ? renderR2Games() : view === "matchups" ? renderR2Matchups() : renderR2Home();
    bindR2(el); bind(el); return;
  }
  if (view === "home") el.innerHTML = renderHome();
  else if (view === "games") { renderGames(el); return; }
  else if (view === "review") el.innerHTML = renderReview();
  else if (view === "progress") el.innerHTML = renderProgress();
  else if (view === "matchups") el.innerHTML = renderMatchups();
  else if (view === "highlights") { el.innerHTML = renderHighlights(); markHlClips(); }
  else if (view === "settings") el.innerHTML = renderSettings();
  bind(el);
}

// ------------------------------------------------------------------ HOME
// ------------------------------------------------------------------ SESSION RECAP
function recapCard() {
  const ss = sessions(realGames()); if (ss.length < 1) return "";
  const last = ss[ss.length - 1], prev = ss[ss.length - 2];
  if (last.games.length < 3 || Date.now() - Date.parse(last.end) > 36 * 3600e3) return "";
  const r = record(last.games), v = metricVals(aggSummaries(last.games)), pv = prev ? metricVals(aggSummaries(prev.games)) : {};
  const keys = ["lc", "tech", "opk", "dpo", "neutral", "gent"];
  // biggest leak: stat furthest below target this session
  let leak = null; for (const m of METRICS) { const sf = shortfall(m, v[m.key]); if (sf != null && sf > 0 && (!leak || sf > leak.sf)) leak = { m, sf, v: v[m.key] }; }
  const hls = last.games.flatMap((g) => (g.highlights || []).map((h) => ({ ...h, g }))).sort((a, b) => b.score - a.score).slice(0, 3);
  const f = cfg.focus, fm = f ? metric(f.key) : null;
  return `<section class="card recap"><div class="card-head"><h2>Session recap</h2><span class="sub">${day(last.start)} · ${clock(last.start)}–${clock(last.end)} · ${last.games.length} games${prev ? ` · compared with ${day(prev.start)}` : ""}</span>
      <button class="linkbtn end" data-recapreview="${esc(last.start)}">Review this session →</button></div>
    <div class="recapgrid">
      <div class="rc-rec"><span class="sub">Record</span><b><span class="good">${r.w}</span><span class="muted">–</span><span class="bad">${r.l}</span></b><span class="sub">${fmt(pct(r.w, r.w + r.l), "%")} wins</span></div>
      ${keys.map((k) => { const m = metric(k), a = v[k], b = pv[k]; const d = a == null || b == null ? null : +(a - b).toFixed(1); const good = d == null || d === 0 ? null : (m.good === "up") === d > 0;
        return `<div class="rc"><span class="sub">${m.name}</span><b class="${tone(m, a)}">${fmt(a, m.unit)}</b><span class="d ${good == null ? "" : good ? "up" : "down"}">${d == null ? (prev ? "–" : "first session") : d === 0 ? "same as last time" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}${m.unit} vs last`}</span></div>`; }).join("")}
    </div>
    <div class="grid2" style="margin-top:14px">
      <div><div class="eyebrow bad">BIGGEST LEAK</div>${leak ? `<p style="margin:6px 0 0;line-height:1.5"><b>${leak.m.name}: ${fmt(leak.v, leak.m.unit)}</b> <span class="sub">(target ${leak.m.good === "up" ? "≥" : "≤"} ${target(leak.m)}${leak.m.unit})</span><br><span class="sub">${esc(leak.m.drill || "")}</span></p>` : `<p class="sub">Everything at or above target. Nice session.</p>`}
        ${f ? `<p class="sub" style="margin:10px 0 0">This week's focus: <b style="color:var(--text)">${fm.name}</b> ${fmt(v[f.key], fm.unit)} this session (started at ${fmt(f.baseline, fm.unit)}).</p>` : ""}</div>
      <div><div class="eyebrow good">BEST PLAYS</div>${hls.length ? `<div class="wlist" style="margin-top:4px">${hls.map((h) => `<button class="wrow" data-hl="${esc(h.g.id)}|${h.frame}"><span class="tag good">${esc(hlTag(h))}</span><span style="min-width:0;flex:1"><b>${esc(h.title)}</b><span class="sub">vs ${esc(h.g.oppChar)} · ${esc(h.detail)}</span></span></button>`).join("")}</div>` : `<p class="sub">No highlights this session.</p>`}</div>
    </div></section>`;
}

// Home hero: your main's portrait (from your own texture pack), with record, latest match and highlights
function homeHero() {
  const mains = topCounts(games.map((g) => g.myChar), 1); const main = mains[0]?.[0] || "Captain Falcon";
  const mine = games.filter((g) => g.myChar === main); const done = mine.filter((g) => g.complete !== false);
  const all = record(done); const recent = record(done.slice(0, 50));
  const latest = games[0]; const lv = latest ? metricVals(aggSummaries([latest])) : {};
  const name = games.find((g) => g.myName)?.myName || cfg.connectCode || "Player";
  const hls = games.slice(0, 30).flatMap((g) => (g.highlights || []).map((h) => ({ ...h, g }))).filter((h) => h.kind === "string" || h.kind === "comeback" || h.kind === "4stock")
    .sort((a, b) => b.score - a.score).slice(0, 3);
  const winp = (r) => (r.w + r.l ? Math.round((100 * r.w) / (r.w + r.l)) : null);
  return `<section class="hero">
    <div class="hero-art" id="heroArt" data-char="${esc(main)}"><div class="hero-ph">${esc(main.split(" ").map((w) => w[0]).join("").slice(0, 2))}</div></div>
    <div class="hero-main">
      <div class="hero-top"><div><div class="eyebrow">Welcome back</div><h1>${esc(name)}</h1>
        <div class="sub">${cfg.connectCode ? esc(cfg.connectCode) + " · " : ""}${esc(main)} main · ${mine.length} games · last played ${day(games[0].startedAt)}</div></div>
        <div class="hero-act">${statusPill()}<button class="btn" data-act="import">Import replays</button></div></div>
      <div class="hero-grid">
        <div class="stat hero-rec"><label>Record as ${esc(main)}</label><b>${all.w}–${all.l}</b><span>${fmt(winp(all), "%")} wins · last 50: ${recent.w}–${recent.l}</span></div>
        ${latest ? `<button class="hero-card" data-game="${esc(latest.id)}"><div class="eyebrow">Latest match</div>
          <div class="hl-row">${chip(latest.oppChar, 34)}<div style="min-width:0"><b>vs ${esc(latest.oppChar)}</b> <span class="res ${latest.result}">${latest.result === "win" ? "W" : latest.result === "loss" ? "L" : "–"}</span>
            <div class="sub">${esc(latest.stage)} · ${dur(latest.durationFrames || 0)} · ${when(latest.startedAt)}</div></div></div>
          <div class="gmini"><span>L-cancels ${fmt(lv.lc, "%")}</span><span>Missed techs ${fmt(lv.tech, "%")}</span><span>Openings/kill ${fmt(lv.opk, "")}</span></div></button>` : ""}
        <div class="hero-card hero-hl"><div class="card-head"><div class="eyebrow">Highlights</div><button class="linkbtn end" data-go="highlights">All →</button></div>
          ${hls.length ? hls.map((h) => `<button class="hl-row" data-hlgo="${esc(h.g.id)}|${h.frame}">${chip(h.g.oppChar, 26)}<span style="min-width:0;flex:1"><b>${esc(h.title)}</b><span class="sub" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">vs ${esc(h.g.oppChar)} · ${esc(h.detail || "")}</span></span></button>`).join("")
            : `<div class="sub" style="margin-top:6px">Your best plays show up here.</div>`}</div>
      </div>
    </div></section>`;
}
async function loadHeroArt() {
  const box = $("#heroArt"); if (!box) return; const ch = box.dataset.char; const idx = (cfg.artCostume || {})[ch] || 0;
  const r = await api.charArt(ch, idx); if (!box.isConnected) return;
  if (!r.found) { box.title = r.pack ? `No ${ch} portrait in your ${r.pack} pack` : "Install a texture pack (Melee HD, Animelee…) to see your character here"; return; }
  box.innerHTML = `<img src="${r.data}" alt="${esc(ch)}"><span class="hero-pack">${esc(r.pack || "")}</span>
    ${r.count > 1 ? `<div class="hero-cost"><button class="btn icon" data-cost="-1" aria-label="Previous costume">‹</button><span>${r.index + 1}/${r.count}</span><button class="btn icon" data-cost="1" aria-label="Next costume">›</button></div>` : ""}`;
  $$("[data-cost]", box).forEach((b) => b.onclick = async () => { const n = r.index + +b.dataset.cost; cfg = await api.setConfig({ artCostume: { ...(cfg.artCostume || {}), [ch]: n } }); loadHeroArt(); });
}
function renderHome() {
  if (!games.length) return `<div class="page">${liveStrip()}<div class="card empty">
    <h2 style="color:var(--text);margin-bottom:6px">No games yet</h2>
    Play with the coach open, or add your replay folders in Settings — Melee Unlocked and Slippi replays are imported automatically.
    <div style="margin-top:16px"><button class="btn primary" data-go="settings">Open settings</button></div></div></div>`;
  const ss = sessions(games); const last = ss[ss.length - 1]; const lg = last.games;
  const complete = lg.filter((g) => g.complete !== false);
  const t = aggSummaries(lg); const r = record(complete); const vals = metricVals(t);
  const scored = METRICS.filter((m) => vals[m.key] !== null).map((m) => ({ m, v: vals[m.key], s: score(m, vals[m.key]) })).sort((a, b) => a.s - b.s);
  const focus = scored[0];
  const allT = aggSummaries(games.slice(0, 200)); const allVals = metricVals(allT);
  const moments = lg.flatMap((g) => g.moments || []).sort((a, b) => b.severity - a.severity || b.damage - a.damage);
  const mu = {}; for (const g of complete) { const x = (mu[g.oppChar] ||= { w: 0, l: 0 }); if (g.result === "win") x.w++; else if (g.result === "loss") x.l++; }
  const muRows = Object.entries(mu).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l));
  const prog = ss.slice(-8).map((s) => ({ s, v: metricVals(aggSummaries(s.games))[ui.progMetric] }));
  const pm = metric(ui.progMetric);
  const fv = focus?.v, fm = focus?.m;
  const focusDetail = fm?.key === "lc"
    ? `Misses: <b style="color:var(--yellow)">${t.lcEarly} early</b>, ${t.lcLate} late, ${t.lcNone} with no press.${t.lcEarly > t.lcLate * 2 ? " Press L closer to touching the ground, not as the aerial comes out." : ""}`
    : fm?.why || "";
  return `<div class="page">${liveStrip()}
    ${homeHero()}
    ${recapCard()}

    <div class="grid2">
      <section class="card"><div class="card-head"><h2>Last session</h2>
        <span class="sub">${day(last.start)} · ${clock(last.start)}–${clock(last.end)} · ${lg.length} game${lg.length > 1 ? "s" : ""}</span></div>
        <div class="stats">
          <div class="stat"><label>Record</label><b><span class="good">${r.w}</span><span class="muted"> – </span><span class="bad">${r.l}</span></b><span>${fmt(pct(r.w, r.w + r.l), "% wins")}</span></div>
          <div class="stat"><label>L-cancel rate</label><b style="color:${toneColor[tone(metric("lc"), vals.lc)]}">${fmt(vals.lc, "%")}</b><span>${t.lcOk} of ${t.lcTotal} landings</span></div>
          <div class="stat"><label>Missed techs</label><b style="color:${toneColor[tone(metric("tech"), vals.tech)]}">${fmt(vals.tech, "%")}</b><span>${t.missedTechs} of ${t.techs}</span></div>
          <div class="stat"><label>Openings per kill</label><b>${fmt(vals.opk)}</b><span>${t.openings} openings</span></div>
        </div>
        <div style="display:flex;gap:18px;margin-top:14px;color:#a3a5ad;font-size:13px;flex-wrap:wrap">
          <span>Gentlemen <b style="color:var(--text)">${t.gentlemen}/${t.jab3}</b></span>
          <span>Knee sweetspots <b style="color:var(--text)">${t.sweetKnees}/${t.knees}</b></span>
          <span>Moments found <b style="color:var(--text)">${moments.length}</b></span></div>
      </section>

      ${cfg.focus ? focusCard(true) : ""}
    </div>

    <section class="card"><div class="card-head"><h2>Moments to review</h2><span class="sub">mistakes from last session that got punished</span>
      <button class="linkbtn end" data-go="review">Open review →</button></div>
      ${moments.length ? `<div class="grid3" style="margin-top:14px">${moments.slice(0, 3).map((m) => `
        <button class="moment" data-moment="${esc(m.gameId)}|${m.frame}|${m.type}">
          <span style="display:flex;justify-content:space-between;align-items:center"><span class="tag ${sevTag(m)}">${esc(m.tag.toUpperCase())}</span><span class="sub">${m.time}</span></span>
          <span class="t">${esc(m.title)}</span><p>${esc(m.detail)}</p><span class="sub">vs ${esc(m.opp)} · ${esc(m.stage)}</span></button>`).join("")}</div>`
        : '<div class="sub" style="margin-top:12px">Nothing punished to review — clean session.</div>'}
    </section>
    ${(() => { const hs = lg.flatMap((g) => (g.highlights || []).map((h) => ({ ...h, g }))).sort((a, b) => b.score - a.score).slice(0, 3);
      return hs.length ? `<section class="card"><div class="card-head"><h2>Highlights</h2><span class="sub">what you did well last session</span>
        <button class="linkbtn end" data-go="highlights">All highlights →</button></div>
        <div class="grid3" style="margin-top:14px">${hs.map((h) => `<button class="moment good" data-hl="${esc(h.g.id)}|${h.frame}">
          <span style="display:flex;justify-content:space-between;align-items:center"><span class="tag good">${esc(hlTag(h))}</span><span class="sub">${ftime(h.frame)}</span></span>
          <span class="t">${esc(h.title)}</span><p>${esc(h.detail)}</p><span class="sub">vs ${esc(h.g.oppChar)} · ${esc(h.g.stage)}</span></button>`).join("")}</div></section>` : ""; })()}

    <div class="grid2">
      <section class="card"><div class="card-head"><h2>Progress</h2><span class="sub">by session</span>
        <div class="seg end">${["lc", "tech", "opk"].map((k) => `<button class="${ui.progMetric === k ? "on" : ""}" data-prog="${k}">${{ lc: "L-cancel", tech: "Techs", opk: "Openings/kill" }[k]}</button>`).join("")}</div></div>
        ${progressBars(prog, pm)}
      </section>
      <section class="card"><div class="card-head"><h2>Matchups</h2><span class="sub">last session</span></div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px">
        ${muRows.slice(0, 5).map(([c, x]) => { const p = pct(x.w, x.w + x.l) ?? 0; const col = p >= 60 ? "var(--teal)" : p >= 40 ? "var(--yellow)" : "var(--red)";
          return `<div class="mu">${chip(c, 28)}<span>${esc(c)}</span><b style="color:${col}">${x.w} – ${x.l}</b><div class="meter"><div style="width:${p}%;background:${col}"></div></div></div>`; }).join("")}
        ${muRows.length > 5 ? `<div class="sub" style="margin-top:4px">+ ${muRows.slice(5).map(([c, x]) => `${esc(c)} ${x.w}–${x.l}`).join(" · ")}</div>` : ""}
        </div></section>
    </div>

    <section class="card"><div class="card-head"><h2>Recent games</h2><button class="linkbtn end" data-go="games">All games →</button></div>
      <div class="strip" style="margin-top:12px">${games.slice(0, 8).map((g) => `<button class="gchip" data-game="${esc(g.id)}">${chip(g.oppChar)}
        <span style="min-width:0"><span style="display:block">${esc(g.oppChar)} <span class="res ${g.result}">${g.result === "win" ? "W" : g.result === "loss" ? "L" : "–"}</span></span>
        <span class="sub" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.stage)} · LC ${fmt(pct(g.totals.lcOk, g.totals.lcTotal), "%")}</span></span></button>`).join("")}</div>
    </section>
  </div>`;
}
function progressBars(prog, m) {
  const pts = prog.filter((p) => p.v !== null);
  if (!pts.length) return '<div class="sub" style="margin-top:14px">Not enough data yet.</div>';
  const max = m.unit === "%" ? 100 : Math.max(...pts.map((p) => p.v), target(m)) * 1.15;
  const plotH = 156; // .pchart height minus bottom padding
  return `<div class="pchart" role="img" aria-label="${m.name} by session">
    <div class="tline" style="bottom:${44 + (target(m) / max) * plotH}px"><span>target ${target(m)}${m.unit}</span></div>
    ${prog.map((p) => { const col = p.v === null ? "var(--line)" : toneColor[tone(m, p.v)];
      return `<div class="col">${p.v === null ? "" : `<span class="v" style="color:${col}">${p.v}${m.unit}</span>`}
        <div class="b" style="height:${p.v === null ? 0 : Math.max(3, (p.v / max) * (plotH - 22))}px;background:${col}"></div>
        <div class="x">${new Date(p.s.start).toLocaleDateString([], { month: "short", day: "numeric" })}<small>${p.s.games.length} game${p.s.games.length > 1 ? "s" : ""}</small></div></div>`; }).join("")}
  </div>`;
}

// ------------------------------------------------------------------ GAMES (per-game dashboard)
async function renderGames(el) {
  if (!games.length) { el.innerHTML = `<div class="page"><div class="card empty">No games yet.</div></div>`; return; }
  const pool = byOpp(games);
  if (!pool.length) { ui.opp = null; return renderGames(el); }
  if (!ui.gameId || !pool.some((g) => g.id === ui.gameId)) ui.gameId = pool[0].id;
  const g = await loadGame(ui.gameId);
  const r = record(pool.filter((x) => x.complete !== false));
  el.innerHTML = `<div class="games-layout">
    <aside class="glist"><div class="head"><b>Games</b><span class="sub" style="margin-left:auto">${r.w}W – ${r.l}L</span></div>
      <div style="padding:0 10px 8px">${oppSelect()}</div>
      <div class="rows">${(() => {
        // month → games; the month of the game you're viewing opens by itself
        const monthOf = (iso) => new Date(iso).toLocaleDateString([], { month: "long", year: "numeric" });
        const months = [];
        for (const x of pool) { const m = monthOf(x.startedAt), d = day(x.startedAt);
          let M = months[months.length - 1]; if (!M || M.m !== m) months.push(M = { m, days: [], n: 0, l: [] });
          let D = M.days[M.days.length - 1]; if (!D || D.d !== d) M.days.push(D = { d, l: [] });
          D.l.push(x); M.l.push(x); }
        ui.gdayOpen ||= new Set(); ui.gmonOpen ||= new Set();
        const selDay = day(g.startedAt), selMon = monthOf(g.startedAt);
        if (ui._closeSel !== selDay) ui.gdayOpen.add(selDay);
        if (ui._closeSelMon !== selMon) ui.gmonOpen.add(selMon);
        const rec = (l) => { const r = record(l.filter((x) => x.complete !== false)); return `${r.w}–${r.l}`; };
        const row = (x) => { const v = metricVals(aggSummaries([x]));
          return `<button class="grow ${x.id === g.id ? "sel" : ""}" data-game="${esc(x.id)}">
            ${chip(x.oppChar, 34)}
            <span class="who"><div>${esc(x.oppChar)}${x.oppCode ? ` <span class="sub">${esc(x.oppCode)}</span>` : ""}</div>
              <div class="sub">${new Date(x.startedAt).toLocaleDateString([], { month: "short", day: "numeric" })}, ${clock(x.startedAt)} · ${esc(x.stage)}</div>
              <div class="gmini"><span title="L-cancel rate">LC ${fmt(v.lc, "%")}</span><span title="Missed techs">Missed techs ${fmt(v.tech, "%")}</span></div></span>
            <span class="res ${x.result}">${x.result === "win" ? "W" : x.result === "loss" ? "L" : "–"}</span></button>`; };
        return months.map(({ m, days, l }) => { const mo = ui.gmonOpen.has(m);
          return `<button class="gmon ${mo ? "open" : ""}" data-gmon="${esc(m)}" aria-expanded="${mo}"><span class="chev">›</span><span>${esc(m)}</span>
            <span class="gdmeta">${l.length} game${l.length === 1 ? "" : "s"} · ${rec(l)}</span></button>
            ${mo ? l.map(row).join("") : ""}`; }).join("");
      })()}
      </div></aside>
    <div class="gdetail"><div class="page">${liveStrip()}${gameDetail(g)}</div></div></div>`;
  bind(el);
  const sel = $(".grow.sel", el); if (sel && !ui._scrolled) { sel.scrollIntoView({ block: "nearest" }); }
}

function gameDetail(g) {
  const stockList = ui.stock === "all" ? g.stocks : g.stocks.filter((s) => s.n === ui.stock);
  const conv = ui.stock === "all" ? g.conversions : g.conversions.filter((c) => c.stock === ui.stock);
  const t = totalsFrom(stockList, conv), all = totalsFrom(g.stocks, g.conversions);
  const recent = games.filter((x) => x.id !== g.id && x.complete !== false).slice(0, 20);
  const avg = metricVals(aggSummaries(recent));
  const sameDay = metricVals(aggSummaries(recent.filter((x) => new Date(x.startedAt).toDateString() === new Date(g.startedAt).toDateString())));
  const rows = METRICS.map((m) => ({ m, v: m.min(t) ? m.get(t) : null }));
  if (!ui.metric || !METRICS.some((m) => m.key === ui.metric)) ui.metric = METRICS[0].key;
  const focus = rows.find((r) => r.m.key === ui.metric);
  const cards = [{ n: "all", label: "Whole game", land: all.land, dd: all.dmgDealt, dt: all.dmgTaken }]
    .concat(g.stocks.map((s) => ({ n: s.n, label: `Stock ${s.n}`, land: s.landings, lost: s.lostBy === "ko" ? s.killMove || "KO" : null, dd: s.dmgDealt, dt: s.dmgTaken })));
  const worst = Math.min(...g.stocks.map((s) => pct(s.landings.filter((x) => x.ok).length, s.landings.length) ?? 101));
  return `
    <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap"><h1 style="margin:0;font-size:20px">${esc(g.myChar)} vs ${esc(g.oppChar)}</h1>
      <span class="res ${g.result}">${g.result.toUpperCase()}</span>
      <span class="sub">${esc(g.stage)} · ${dur(g.durationFrames)} · ${when(g.startedAt)}${g.oppCode ? " · " + esc(g.oppCode) : ""}${g.complete === false ? " · ended early" : ""}</span>
      ${g.file ? `<button class="linkbtn" style="margin-left:auto" data-replay="${esc(g.file)}">Show replay file</button>` : ""}</div>
    <div class="stocks">${cards.map((c) => { const v = pct(c.land.filter((x) => x.ok).length, c.land.length);
      const tn = v === null ? "muted" : v >= 60 ? "good" : v >= 35 ? "mid" : "bad";
      return `<button class="scard ${ui.stock === c.n ? "sel" : ""}" data-stock="${c.n}">
        ${c.n !== "all" && v === worst && g.stocks.length > 1 ? '<span style="position:absolute;top:8px;right:8px;width:16px;height:16px;border-radius:50%;background:rgba(239,100,97,.2);color:var(--red);font-size:11px;line-height:16px">!</span>' : ""}
        ${gauge(v, toneColor[tn])}<div class="t">${c.label}</div>
        <div class="d">${c.n === "all" ? `${c.land.length} landings` : c.lost ? `Lost to ${esc(c.lost)}` : "Survived"}</div>
        <div class="d">+${c.dd}% / −${c.dt}%</div></button>`; }).join("")}</div>
    <section class="card"><div class="card-head"><h2>Scorecard</h2><span class="sub">the same ${METRICS.length} stats for every game · vs your last ${recent.length} games</span></div>
      <div class="scorecard">${rows.map((r) => { const a = avg[r.m.key]; const d = r.v == null || a == null ? null : +(r.v - a).toFixed(1);
        const better = d == null || d === 0 ? null : (r.m.good === "up") === d > 0;
        return `<button class="sc ${r.m.key === ui.metric ? "sel" : ""}" data-metric="${r.m.key}"><span class="n">${r.m.name}</span>
          <b class="${tone(r.m, r.v)}">${fmt(r.v, r.m.unit)}</b>
          <span class="d ${better == null ? "" : better ? "up" : "down"}">${d == null ? "no data" : d === 0 ? "= your average" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}${r.m.unit} vs avg`}</span></button>`; }).join("")}</div></section>
    ${focus ? `<section class="card"><h3 class="ptitle">${focus.m.name}</h3><div class="why">${focus.m.why}</div><div class="tablewrap">
      <table><tr><th>Stat</th><th>${ui.stock === "all" ? "This game" : "Stock " + ui.stock}</th><th>Your average <span class="sub">(last ${recent.length})</span></th><th>Same day</th><th>Target</th></tr>
      ${rows.map((r) => `<tr class="${r.m.key === ui.metric ? "hl" : ""}"><td>${r.m.name}</td><td class="${tone(r.m, r.v)}"><b>${fmt(r.v, r.m.unit)}</b></td>
        <td>${fmt(avg[r.m.key], r.m.unit)}</td><td>${fmt(sameDay[r.m.key], r.m.unit)}</td><td class="muted">${r.m.good === "up" ? "≥" : "≤"} ${target(r.m)}${r.m.unit}</td></tr>`).join("")}</table></div></section>` : ""}
    ${ui.stock === "all" ? stockStory(g) : ""}
    ${(g.moments || []).length && ui.stock === "all" ? `<section class="card"><h3 class="ptitle">Moments in this game</h3><div class="why">Mistakes the opponent punished.</div>
      ${g.moments.map((m) => `<button class="story" data-moment="${esc(m.gameId)}|${m.frame}|${m.type}"><span class="tag ${sevTag(m)}">${esc(m.tag)}</span><span><b>${esc(m.title)}</b> <span class="sub">· ${m.time}</span></span></button>`).join("")}</section>` : ""}
    ${lcPanel(t)}
    <details ${ui.open.conv ? "open" : ""} data-k="conv"><summary><span class="chev">›</span><span>Openings &amp; conversions<small>who won neutral, and what it was worth</small></span>
      <span><small>You</small><b class="good">${t.openings} openings</b></span><span><small>Opponent</small><b class="mid">${t.oppOpenings} openings</b></span></summary>
      <div class="dbody">${convBody(t)}</div></details>
    <details ${ui.open.habits ? "open" : ""} data-k="habits"><summary><span class="chev">›</span><span>Habits<small>techs, getups and ledge options</small></span>
      <span><small>Missed techs</small><b>${t.missedTechs}/${t.techs}</b></span><span><small>Top ledge option</small><b>${esc(topKey(t.ledge) || "–")}</b></span></summary>
      <div class="dbody"><div class="cols3"><div><div class="sub" style="margin-bottom:4px">Techs</div>${bars({ ...t.tech, "missed tech": t.missedTechs })}</div>
        <div><div class="sub" style="margin-bottom:4px">Getups after a missed tech</div>${bars(t.getups)}</div>
        <div><div class="sub" style="margin-bottom:4px">Ledge options</div>${bars(t.ledge)}</div></div></div></details>`;
}

function stockStory(g) {
  const lines = g.stocks.map((s) => {
    const land = s.landings, ok = land.filter((x) => x.ok).length, by = {};
    for (const x of land) if (!x.ok) { const a = (by[x.aerial] ||= { n: 0, early: [], late: [], none: 0 }); a.n++;
      if (x.timing === "early") a.early.push(x.frames); else if (x.timing === "late") a.late.push(x.frames); else a.none++; }
    const worst = Object.entries(by).sort((a, b) => b[1].n - a[1].n)[0];
    const avg = (a) => Math.round(a.reduce((p, c) => p + c, 0) / a.length);
    let lc = land.length ? `L-cancels <b>${ok}/${land.length}</b>` : "No aerial landings";
    if (worst) { const [name, a] = worst; const kind = a.early.length >= a.late.length && a.early.length >= a.none ? `${avg(a.early)} frame${avg(a.early) === 1 ? "" : "s"} early`
        : a.late.length >= a.none ? `${avg(a.late)} frames late` : "no L/R/Z press";
      lc += ` — missed ${a.n} on ${esc(name)}, ${a.n > 1 ? "mostly " : ""}${kind}`; }
    const bits = [lc];
    if (s.missedTechs) bits.push(`missed ${s.missedTechs} tech${s.missedTechs > 1 ? "s" : ""}`);
    if (s.jab3) bits.push(`gentlemen ${s.gentlemen}/${s.jab3}`);
    bits.push(s.lostBy === "ko" ? `lost it to ${esc(s.killMove || "a KO")} (dealt ${s.dmgDealt}%, took ${s.dmgTaken}%)` : `survived (dealt ${s.dmgDealt}%)`);
    return `<button class="story" data-stock="${s.n}"><span class="n">${s.n}</span><span>${bits.join(" · ")}</span></button>`;
  });
  return `<section class="card"><h3 class="ptitle">Stock by stock</h3><div class="why">Click a stock to see its full breakdown.</div>${lines.join("")}</section>`;
}

function lcPanel(t) {
  if (!t.land.length) return "";
  const bins = [];
  for (let e = 10; e >= 1; e--) bins.push({ k: "e" + e, lab: e === 10 ? "10+" : String(e), col: "var(--yellow)" });
  bins.push({ k: "ok", lab: "✓", col: "var(--teal)" });
  for (let l = 1; l <= 6; l++) bins.push({ k: "l" + l, lab: l === 6 ? "6+" : String(l), col: "var(--blue)" });
  bins.push({ k: "none", lab: "none", col: "var(--red)" });
  const cnt = {};
  for (const x of t.land) { const k = x.timing === "ok" ? "ok" : x.timing === "early" ? "e" + Math.min(10, x.frames) : x.timing === "late" ? "l" + Math.min(6, x.frames) : "none"; cnt[k] = (cnt[k] || 0) + 1; }
  const max = Math.max(...Object.values(cnt)); const by = {};
  for (const x of t.land) { const a = (by[x.aerial] ||= { ok: 0, n: 0, early: [], late: [], none: 0 }); a.n++;
    if (x.ok) a.ok++; else if (x.timing === "early") a.early.push(x.frames); else if (x.timing === "late") a.late.push(x.frames); else a.none++; }
  const avg = (a) => (a.length ? (a.reduce((p, c) => p + c, 0) / a.length).toFixed(1) : null);
  const early = t.land.filter((x) => x.timing === "early"), late = t.land.filter((x) => x.timing === "late");
  const tip = early.length > late.length * 2 && early.length >= 3 ? `Most misses are <b>early</b>, on average ${avg(early.map((x) => x.frames))} frames. Press L a little later, closer to touching the ground.`
    : late.length > early.length && late.length >= 3 ? "Most misses are <b>late</b>. Press as your aerial finishes, not on landing." : "When you pressed L/R/Z relative to the 7-frame window before landing.";
  return `<section class="card"><h3 class="ptitle">L-cancel timing</h3><div class="why">${tip}</div>
    <div class="hist">${bins.map((b) => `<div style="height:${((cnt[b.k] || 0) / max) * 100}%;background:${b.col}">${cnt[b.k] ? `<span>${cnt[b.k]}</span>` : ""}</div>`).join("")}</div>
    <div class="histx">${bins.map((b) => `<div>${b.lab}</div>`).join("")}</div>
    <div class="legend"><span><i style="background:var(--yellow)"></i>frames too early</span><span><i style="background:var(--teal)"></i>L-cancelled</span><span><i style="background:var(--blue)"></i>frames too late</span><span><i style="background:var(--red)"></i>no press</span></div>
    <div class="tablewrap"><table style="margin-top:14px"><tr><th>Aerial</th><th>L-cancelled</th><th>Too early</th><th>Too late</th><th>No press</th></tr>
    ${Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([k, a]) => `<tr><td>${esc(k)}</td><td class="${a.ok / a.n >= .6 ? "good" : a.ok / a.n >= .35 ? "mid" : "bad"}"><b>${a.ok}/${a.n}</b></td>
      <td>${a.early.length ? `${a.early.length} <span class="sub">· avg ${avg(a.early)}f early</span>` : "–"}</td><td>${a.late.length ? `${a.late.length} <span class="sub">· avg ${avg(a.late)}f late</span>` : "–"}</td><td>${a.none || "–"}</td></tr>`).join("")}</table></div></section>`;
}

function convBody(t) {
  const d = (l) => (l.length ? Math.round(l.reduce((a, c) => a + c.damage, 0) / l.length) : null);
  const openers = mergeObj(t.mine.map((c) => ({ [c.opener]: 1 }))), killers = mergeObj(t.mine.filter((c) => c.killed).map((c) => ({ [c.opener]: 1 })));
  return `<div class="tablewrap"><table><tr><th></th><th>You</th><th>Opponent</th></tr>
    <tr><td>Openings</td><td><b>${t.openings}</b></td><td>${t.oppOpenings}</td></tr>
    <tr><td>Damage per opening</td><td><b>${fmt(d(t.mine), "%")}</b></td><td>${fmt(d(t.theirs), "%")}</td></tr>
    <tr><td>Openings that took a stock</td><td><b>${t.convKills}</b></td><td>${t.theirs.filter((c) => c.killed).length}</td></tr>
    <tr><td>Openings per kill</td><td><b>${fmt(t.kills ? (t.openings / t.kills).toFixed(1) : null)}</b></td><td>${fmt(t.deaths ? (t.oppOpenings / t.deaths).toFixed(1) : null)}</td></tr>
    <tr><td>Knee sweetspots</td><td><b>${t.sweetKnees}/${t.knees}</b></td><td class="muted">–</td></tr></table></div>
    <div class="grid2" style="margin-top:14px;gap:24px"><div><div class="sub" style="margin-bottom:4px">Your openings started with</div>${bars(openers)}</div>
      <div><div class="sub" style="margin-bottom:4px">Openings that ended in a kill</div>${bars(killers)}</div></div>`;
}

// ------------------------------------------------------------------ REVIEW
// ------------------------------------------------------------------ REVIEW (match by match)
// Each match is recorded once as a video; every missed L-cancel, missed tech, stock and habit in it
// becomes a marker on that video's timeline.
const EV = {
  lcancel: { label: "L-cancels", color: "var(--yellow)" },
  tech: { label: "Missed techs", color: "#f0883e" },
  habit: { label: "Habits", color: "#b48cf2" },
  death: { label: "Stocks lost", color: "var(--red)" },
  kill: { label: "Stocks taken", color: "var(--teal)" },
  good: { label: "Highlights", color: "#5fd38d" },
};
const hlTag = (h) => ({ string: h.killed ? "KILL" : "COMBO", lcancel: "EXECUTION", tech: "EXECUTION", mixup: "MIXUP", gentleman: "EXECUTION", comeback: "COMEBACK", "4stock": "4-STOCK" }[h.kind] || "NICE");
const LEAD = 120, TAIL = 90; // frames shown before / after each event
const evKey = (e) => `${e.type}|${e.frame}`;
const ftime = (f) => dur(Math.max(0, f + 123));
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function gameEvents(g) {
  const ev = [], mom = new Map((g.moments || []).map((m) => [`${m.type}|${m.frame}`, m]));
  for (const st of g.stocks || []) {
    for (const l of st.landings || []) if (!l.ok) ev.push({ type: "lcancel", frame: l.frame, stock: st.n, aerial: l.aerial, timing: l.timing, frames: l.frames,
      label: `${l.timing === "no press" ? "Missed" : cap(l.timing)} ${l.aerial} L-cancel`,
      sub: l.timing === "early" ? `pressed ${l.frames} frame${l.frames === 1 ? "" : "s"} too early` : l.timing === "late" ? `pressed ${l.frames} frame${l.frames === 1 ? "" : "s"} late` : "no L/R/Z press" });
    for (const f of st.missedTechFrames || []) ev.push({ type: "tech", frame: f, stock: st.n, label: "Missed tech", sub: "hit the ground without teching" });
    if (st.lostBy === "ko") ev.push({ type: "death", frame: st.endFrame, stock: st.n, label: `Lost stock ${st.n}`, sub: st.killMove ? `killed by ${st.killMove}` : "KO" });
  }
  for (const c of g.conversions || []) if (c.side === "mine" && c.killed)
    ev.push({ type: "kill", frame: c.last, stock: c.stock, label: "Took a stock", sub: `${c.hits}-hit string from ${c.opener}, ${Math.round(c.damage)}%` });
  for (const m of g.moments || []) if (m.type === "habit") ev.push({ type: "habit", frame: m.frame, stock: m.stock, label: m.title, sub: m.tag });
  // highlights: a combo that took a stock replaces the plain "Took a stock" event
  for (const h of g.highlights || []) {
    if (h.kind === "string" && h.killed) { const i = ev.findIndex((e) => e.type === "kill" && Math.abs(e.frame - h.end) < 400); if (i >= 0) ev.splice(i, 1); }
    if (!h.end && h.kind !== "comeback") continue; // stock/game-wide notes live in "What went well", not on the timeline
    ev.push({ type: "good", frame: h.frame, end: h.end, stock: h.stock, label: h.title, sub: h.detail, hl: h });
  }
  for (const e of ev) e.moment = mom.get(evKey(e)) || null;
  return ev.sort((x, y) => x.frame - y.frame);
}
function evTip(e) {
  if (e.type === "good") return goodNote(e.hl);
  if (e.moment) return tryInstead(e.moment);
  if (e.type === "lcancel") return tryInstead({ type: "lcancel", timing: e.timing === "no press" ? "none" : e.timing });
  if (e.type === "tech") return tryInstead({ type: "tech" });
  if (e.type === "death") return "Watch the few seconds before: how did they get the opening, and was there a moment you could have escaped or teched?";
  if (e.type === "kill") return "This worked. Note the opener and the follow-ups so you can look for the same setup again.";
  return tryInstead({ type: "habit" });
}

function goodNote(h) {
  if (!h) return "";
  if (h.tags?.includes("zero-to-death")) return "One opening, one stock. Watch how you kept them in the air; that route is worth repeating.";
  if (h.tags?.includes("falcon punch")) return "Show me your moves! A Falcon Punch kill is a hard read; remember what told you it was coming.";
  if (h.tags?.includes("gimp")) return "You sent them offstage and they never made it back. Edgeguards like this take stocks at low percent.";
  if (h.tags?.includes("early kill")) return "Taking a stock this early means you found the kill confirm. Note the percent and the setup.";
  if (h.tags?.includes("creative")) return "Varied strings are hard to DI. Mixing moves like this keeps your punishes unpredictable.";
  if (h.tags?.includes("long string")) return "Long combo: you kept your opponent in hitstun. This is the kind of punish that wins neutral exchanges back.";
  if (h.kind === "lcancel") return "Clean landings all stock long: that's what keeps you safe on shield.";
  if (h.kind === "tech") return "No free tech chases given away. Keep mixing your tech options like this.";
  if (h.kind === "mixup") return "Your tech and getup options were hard to read. That's exactly what makes tech chases fail.";
  if (h.kind === "comeback") return "You stayed composed when behind. Look at what changed in the stocks you won back.";
  if (h.kind === "4stock") return "Didn't drop a stock. Rewatch your neutral: what were they unable to deal with?";
  if (h.kind === "gentleman") return "Clean gentleman timing without a rapid jab.";
  return "Nice.";
}

// Opponent filter shared by Review, Games and Highlights
function oppList() { const c = {}; for (const g of games) c[g.oppChar] = (c[g.oppChar] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]); }
const byOpp = (list) => (ui.opp ? list.filter((g) => g.oppChar === ui.opp) : list);
function oppSelect() {
  const opts = [["", "All characters"], ...oppList().map(([k, n]) => [k, `${k} (${n})`])];
  return `<label class="oppsel"><span class="sub">Opponent</span><select data-opp aria-label="Filter by opponent">${opts.map(([v, l]) => `<option value="${esc(v)}" ${(ui.opp || "") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
}

function renderReview() {
  const sessList = sessions(byOpp(games)).slice().reverse();
  if (ui.rGame && !(sessList.find((x) => x.start === ui.session)?.games || []).some((x) => x.id === ui.rGame)) {
    const owner = sessList.find((x) => x.games.some((y) => y.id === ui.rGame)); if (owner) ui.session = owner.start; }
  if (!ui.session || !sessList.some((x) => x.start === ui.session)) ui.session = sessList[0]?.start;
  const sess = sessList.find((x) => x.start === ui.session);
  const gs = (sess?.games || []).slice().sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)); // play order (numbers, ‹ ›)
  const newestFirst = gs.slice().reverse();
  if (!ui.rGame || !gs.some((x) => x.id === ui.rGame)) { ui.rGame = gs[gs.length - 1]?.id; ui.rEvent = null; }
  const sum = gs.find((x) => x.id === ui.rGame);
  const g = sum ? cache.get(sum.id) : null;
  if (sum && !g) loadGame(sum.id).then(() => { if (view === "review" && ui.rGame === sum.id) render(); });
  ui.evOn ||= { lcancel: true, tech: true, habit: true, death: true, kill: true, good: true };
  const all = g ? gameEvents(g) : [], shown = all.filter((e) => ui.evOn[e.type]);
  const sel = shown.find((e) => evKey(e) === ui.rEvent) || null;
  const counts = Object.fromEntries(Object.keys(EV).map((k) => [k, all.filter((e) => e.type === k).length]));
  const stocksOf = [...new Set(shown.map((e) => e.stock))];
  const idx = gs.indexOf(sum);
  const total = sessList.reduce((n, x) => n + x.games.length, 0);
  return `<div class="games-layout rv-layout">
    <aside class="glist"><div class="head"><b>Review</b><span class="sub" style="margin-left:auto">${total} match${total === 1 ? "" : "es"}</span></div>
      <div style="padding:0 10px 8px">${oppSelect()}</div>
      <div class="rows">${reviewNav(sessList, sum)}</div></aside>
    <div class="gdetail"><div class="page rvpage">${liveStrip()}
    ${!sum ? `<div class="card empty">No matches yet.</div>` : `
      <section class="card rvplayer">
        <div class="card-head">${chip(sum.oppChar, 30)}<div style="min-width:0"><b style="font-size:15px">Match ${idx + 1} of ${gs.length} · vs ${esc(sum.oppChar)}</b>
            <div class="sub">${day(sum.startedAt)}, ${clock(sum.startedAt)} · ${esc(sum.stage)} · ${dur(sum.durationFrames || 0)} · ${sum.result === "win" ? "won" : sum.result === "loss" ? "lost" : "unfinished"} ${sum.endStocks ? `${sum.endStocks.me ?? "–"}–${sum.endStocks.opp ?? "–"}` : ""}</div></div>
          <span class="end" style="display:flex;gap:6px;align-items:center">
            <button class="btn icon" data-gstep="-1" ${idx <= 0 ? "disabled" : ""} aria-label="Previous match" title="Previous match in this session">‹</button>
            <button class="btn icon" data-gstep="1" ${idx >= gs.length - 1 ? "disabled" : ""} aria-label="Next match" title="Next match in this session">›</button>
            <button class="btn" data-game="${esc(sum.id)}">Stats</button>
            <button class="btn" data-act="recordSession" title="Record every match in this session that doesn't have a video yet">Record session</button></span></div>
        <div class="clipbox" id="clipBox" data-gid="${esc(sum.id)}" style="margin-top:14px"><div class="viewer-ph"><div class="sub">Loading…</div></div></div>
        <div class="evchips" role="group" aria-label="Show events">${Object.entries(EV).map(([k, v]) => `<button class="evchip ${ui.evOn[k] ? "on" : ""}" data-evt="${k}" aria-pressed="${!!ui.evOn[k]}">
          <i style="background:${v.color}"></i>${v.label}<b>${counts[k]}</b></button>`).join("")}</div>
      </section>
      <div class="rvbelow">
      <section class="card evlist">${!g ? `<div class="sub">Loading match…</div>` : !shown.length ? `<div class="sub">Nothing to show for the selected event types. Clean match.</div>` :
        stocksOf.map((n) => { const st = g.stocks.find((x) => x.n === n);
          return `<div class="evstock"><span>Stock ${n}</span><span class="sub">${st ? `${ftime(st.startFrame)}–${ftime(st.endFrame ?? g.durationFrames)}` : ""}</span></div>
          ${shown.filter((e) => e.stock === n).map((e) => `<button class="evrow ${evKey(e) === ui.rEvent ? "sel" : ""}" data-ev="${esc(evKey(e))}">
            <span class="t">${ftime(e.frame)}</span><i class="evdot" style="background:${EV[e.type].color}"></i>
            <span style="min-width:0;flex:1"><b>${esc(e.label)}</b> <span class="sub">${esc(e.sub)}</span></span>
            ${e.moment && e.type !== "habit" ? `<span class="tag ${sevTag(e.moment)}">${esc(e.moment.tag)}</span>` : e.type === "good" ? `<span class="tag good">${esc(hlTag(e.hl))}</span>` : ""}</button>`).join("")}`; }).join("")}</section>
      <div class="rvside">${evDetailHtml(sel)}
        <section class="card"><div class="card-head"><h2>What went well</h2></div>
          ${(g?.highlights || sum.highlights || []).length ? `<div class="wlist">${(g?.highlights || sum.highlights).slice().sort((a, b) => b.score - a.score).slice(0, 6).map((h) => `
            ${h.end || h.kind === "comeback" ? `<button class="wrow" data-ev="good|${h.frame}">` : `<div class="wrow static">`}<span class="tag good">${esc(hlTag(h))}</span><span style="min-width:0;flex:1"><b>${esc(h.title)}</b><span class="sub">${h.end || h.kind === "comeback" ? ftime(h.frame) + " · " : ""}${esc(h.detail)}</span></span>${h.end || h.kind === "comeback" ? "</button>" : "</div>"}`).join("")}</div>`
            : `<div class="sub" style="margin-top:8px">Nothing stood out this match. Highlights show up for long strings, early kills, gimps, clean stocks and comebacks.</div>`}</section>
        ${muCard(sum.oppChar, true)}
      </div></div>`}
    </div></div></div>`;
}

// Review navigator: months (collapsible, like Games) → a divider per session → its matches, newest first.
function reviewNav(sessList, sum) {
  const monthOf = (iso) => new Date(iso).toLocaleDateString([], { month: "long", year: "numeric" });
  const months = [];
  for (const s of sessList) { const m = monthOf(s.start); let M = months[months.length - 1];
    if (!M || M.m !== m) months.push(M = { m, sess: [], n: 0, l: [] }); M.sess.push(s); M.n += s.games.length; M.l.push(...s.games); }
  ui.rmonOpen ||= new Set();
  const selMon = sum ? monthOf(sum.startedAt) : null;
  if (selMon && ui._rCloseMon !== selMon) ui.rmonOpen.add(selMon);
  const rec = (l) => { const r = record(l.filter((x) => x.complete !== false)); return `${r.w}–${r.l}`; };
  return months.map(({ m, sess, n, l }) => { const open = ui.rmonOpen.has(m);
    return `<button class="gmon ${open ? "open" : ""}" data-rmon="${esc(m)}" aria-expanded="${open}"><span class="chev">›</span><span>${esc(m)}</span>
      <span class="gdmeta">${n} match${n === 1 ? "" : "es"} · ${rec(l)}</span></button>
      ${!open ? "" : sess.map((x) => { const gs = x.games.slice().sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
        return `<div class="rsess ${x.start === ui.session ? "cur" : ""}"><span>${day(x.start)} · ${clock(x.start)}</span><span class="sub">${gs.length} · ${rec(gs)}</span></div>
          ${gs.slice().reverse().map((g) => { const t = g.totals || {}; const lcm = (t.lcTotal || 0) - (t.lcOk || 0);
            return `<button class="grow ${sum && g.id === sum.id ? "sel" : ""}" data-rgame="${esc(g.id)}" data-rsess="${esc(x.start)}">
              ${chip(g.oppChar, 34)}
              <span class="who"><div>vs ${esc(g.oppChar)}${g.oppCode ? ` <span class="sub">${esc(g.oppCode)}</span>` : ""}</div>
                <div class="sub">#${gs.indexOf(g) + 1} · ${clock(g.startedAt)} · ${esc(g.stage)}</div>
                <div class="gcounts"><span title="Missed L-cancels"><i style="background:${EV.lcancel.color}"></i>${lcm}</span><span title="Missed techs"><i style="background:${EV.tech.color}"></i>${t.missedTechs || 0}</span><span class="vid" data-vid="${esc(g.id)}" title="Full match recorded"></span></div></span>
              <span class="res ${g.result}">${g.result === "win" ? "W" : g.result === "loss" ? "L" : "–"}</span></button>`; }).join("")}`; }).join("")}`; }).join("");
}

// ------------------------------------------------------------------ match video
const clipState = {}; // key -> { state: "queued"|"rendering"|"encoding"|"error", pct, error }
let player = null; // { v, events, meta, gid, select(e) }
async function loadMatch() {
  const box = $("#clipBox"); if (!box) return; const gid = box.dataset.gid;
  const sum = games.find((x) => x.id === gid); const fullKey = `${gid}_full`;
  const stale = () => !box.isConnected || box.dataset.gid !== gid;
  const info = await api.clipInfo({ gameId: gid, frame: "full" });
  if (stale()) return;
  if (info.has) { if (!(player && player.key === fullKey)) mountPlayer(box, gid, info, null); return; }
  const g = cache.get(gid);
  const sel = g && ui.rEvent ? gameEvents(g).find((e) => evKey(e) === ui.rEvent) : null;
  const len = dur(sum?.durationFrames || 0), fst = clipState[fullKey];
  const recordBtn = (primary) => fst && fst.state !== "error"
    ? `<div class="sub" style="margin-top:10px">${fst.state === "rendering" ? `Recording full match… ${fst.pct ?? 0}%` : fst.state === "paused" ? "Full match recording paused while you play" : "Full match recording queued"}</div>`
    : `<button class="btn ${primary ? "primary" : ""}" style="margin-top:12px" data-record="1">Record full match (${len})</button>`;
  const ph = (inner) => `<div class="viewer-ph"><div style="max-width:460px"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></svg><div style="margin-top:8px">${inner}</div></div></div>`;
  if (sel) {
    const ck = `${gid}_${sel.frame}`;
    if (player && player.key === ck) return;
    const ci = await api.clipInfo({ gameId: gid, frame: sel.frame });
    if (stale()) return;
    if (ci.has) { mountPlayer(box, gid, ci, sel); return; }
    if (!clipState[ck]) {
      clipState[ck] = { state: "queued" };
      api.renderClip({ gameId: gid, frame: sel.frame, end: sel.end ?? sel.frame }).then((r) => { if (!r.ok) { clipState[ck] = { state: "error", error: r.error }; loadMatch(); } });
    }
    const st = clipState[ck]; player = null;
    box.innerHTML = ph(st.state === "error"
      ? `<div class="bad" style="margin-bottom:8px">Couldn't make this clip: ${esc(st.error)}</div><button class="btn primary" data-retry="${esc(ck)}">Try again</button>${recordBtn(false)}`
      : `<div style="font-weight:600;color:var(--soft)">${st.state === "rendering" ? `Making a clip of this moment… ${st.pct ?? 0}%` : st.state === "encoding" ? "Saving clip…" : st.state === "paused" ? "Paused while you play" : "Making a clip of this moment…"}</div>
        <div class="rbar"><span style="width:${st.state === "encoding" ? 100 : st.pct || 0}%"></span></div>
        <div class="sub">About 10 seconds. Slippi's Dolphin plays just this part in a small window in the corner.</div>${recordBtn(false)}`);
  } else {
    player = null;
    box.innerHTML = ph(`<div style="font-weight:600;color:var(--soft)">Pick an event below to watch it.</div>
      <div class="sub" style="margin-top:6px">A short clip of that moment is made in about 10 seconds. Or record the whole match once and every event plays from it.</div>${recordBtn(true)}`);
  }
  const b = $("[data-record]", box);
  if (b) b.onclick = async () => { clipState[fullKey] = { state: "queued" }; loadMatch(); const r = await api.renderClip({ gameId: gid, frame: "full" });
    if (!r.ok) { clipState[fullKey] = { state: "error", error: r.error }; loadMatch(); } };
  const rt = $("[data-retry]", box); if (rt) rt.onclick = () => { delete clipState[rt.dataset.retry]; loadMatch(); };
}
function mountPlayer(box, gid, info, clipEv) {
  const g = cache.get(gid); const meta = info.meta || { start: -123, end: (g?.durationFrames || 0) };
  const allEvs = g ? gameEvents(g).filter((e) => ui.evOn[e.type]) : [];
  const evs = clipEv ? allEvs.filter((e) => e.frame >= meta.start && e.frame <= meta.end) : allEvs;
  const fullKey = `${gid}_full`, fst = clipState[fullKey];
  const len = meta.end - meta.start + 1, at = (f) => `${Math.max(0, Math.min(100, (100 * (f - meta.start)) / len))}%`;
  box.innerHTML = `${clipEv ? `<div class="clipbar"><span class="tag teal">CLIP</span><span class="sub">${ftime(meta.start)}–${ftime(meta.end)} of this match</span>
      ${fst && fst.state !== "error" ? `<span class="sub end">${fst.state === "rendering" ? `Recording full match… ${fst.pct ?? 0}%` : "Full match recording queued"}</span>` : `<button class="btn end" data-record="1">Record full match (${dur(g?.durationFrames || 0)})</button>`}</div>` : ""}
    <div class="player" style="--player-h:${cfg.playerH || 60}vh"><video src="${info.url}" preload="auto" playsinline></video><div class="pnote" hidden></div></div>
    <div class="vresize" role="separator" aria-orientation="horizontal" aria-label="Video size" tabindex="0" title="Drag to make the video bigger or smaller (double-click to reset)"><span></span></div>
    <div class="scrub" data-scrub>
      ${(g?.stocks || []).slice(1).map((st) => `<span class="stk" style="left:${at(st.startFrame)}" title="Stock ${st.n}"></span>`).join("")}
      ${evs.map((e) => `<span class="mk ${evKey(e) === ui.rEvent ? "on" : ""}" data-mk="${esc(evKey(e))}" style="left:${at(e.frame)};background:${EV[e.type].color}" title="${ftime(e.frame)} ${esc(e.label)}"></span>`).join("")}
      <span class="played" style="width:0"></span><span class="head" style="left:0"></span><span class="tip" hidden></span></div>
    <div class="itl-wrap"><canvas class="itl" height="150" aria-label="Your inputs frame by frame around the playhead"></canvas>
      <div class="itl-legend"><span><i style="background:#21d0bf55"></i>L-cancel window (7 frames)</span><span><i style="background:#f1c23255"></i>tech window (20 frames)</span><span><i style="background:#ef6461"></i>landing / ground hit</span><span class="sub">one column = one frame · centre line = current frame</span></div></div>
    <div class="pctrl">
      <button class="btn icon" data-p="prevEv" aria-label="Previous event" title="Previous event">⏮</button>
      <button class="btn icon" data-p="back" aria-label="Back one frame" title="Back one frame (←)"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg></button>
      <button class="btn primary icon" data-p="play" aria-label="Play or pause" title="Play / pause (space)"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg></button>
      <button class="btn icon" data-p="fwd" aria-label="Forward one frame" title="Forward one frame (→)"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
      <button class="btn icon" data-p="nextEv" aria-label="Next event" title="Next event">⏭</button>
      <span class="readout" data-readout>–</span>
      <div class="seg" role="group" aria-label="Speed">${[0.25, 0.5, 1].map((r) => `<button data-rate="${r}" class="${r === (ui.rate || 1) ? "on" : ""}">${r === 0.25 ? "¼×" : r === 0.5 ? "½×" : "1×"}</button>`).join("")}</div>
      <label class="switch" style="font-size:12.5px" title="Skip the parts between events"><input type="checkbox" data-evonly ${ui.evOnly ? "checked" : ""}> Events only</label>
      <label class="switch" style="font-size:12.5px"><input type="checkbox" data-stop ${ui.stopAt !== false ? "checked" : ""}> Pause on event</label>
      <span class="vol fsbtn"><button class="btn icon" data-p="mute" aria-label="Mute" title="Mute (M)"></button>
        <input type="range" min="0" max="1" step="0.05" data-vol aria-label="Volume" value="${cfg.clipMuted ? 0 : cfg.clipVolume ?? 1}"></span>
      <button class="btn icon" data-p="fs" aria-label="Full screen" title="Full screen (F)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
    </div>`;
  const v = $("video", box), head = $(".head", box), ro = $("[data-readout]", box), note = $(".pnote", box), scrub = $("[data-scrub]", box);
  const tOf = (f) => Math.max(0, (f - meta.start) / 60), fOf = () => Math.round(v.currentTime * 60) + meta.start;
  const itl = inputTimeline($("canvas.itl", box), gid, meta, g, allEvs);
  let target = null; // event we're heading to (pause when reached)
  v.playbackRate = ui.rate || 1;
  const near = (f) => evs.find((e) => Math.abs(e.frame - f) <= 40) || null;
  const played = $(".played", scrub), tip = $(".tip", scrub);
  const tick = () => {
    const f = fOf(); head.style.left = at(f); played.style.width = at(f); itl.draw(f);
    const e = near(f);
    const total = clipEv ? ftime(meta.end) : dur(meta.end + 123);
    if (e) { const rel = f - e.frame; ro.innerHTML = `<b>${ftime(f)}</b> / ${total} · ${rel === 0 ? "on" : `${rel > 0 ? "+" : ""}${rel}f`} ${esc(e.label)}`; note.hidden = false; note.innerHTML = `<i class="evdot" style="background:${EV[e.type].color}"></i><b>${esc(e.label)}</b> ${esc(e.sub)}`; }
    else { ro.innerHTML = `<b>${ftime(f)}</b> / ${total}`; note.hidden = true; }
    if (!v.paused) {
      if (target && target.type !== "good" && ui.stopAt !== false && f >= target.frame) { v.pause(); v.currentTime = tOf(target.frame); target = null; }
      else if (ui.evOnly) {
        const cur = evs.filter((x) => f >= x.frame - LEAD && f <= (x.end || x.frame) + TAIL);
        if (!cur.length) { const nx = evs.find((x) => x.frame - LEAD > f); if (nx) { v.currentTime = tOf(nx.frame - LEAD); target = nx; } else v.pause(); }
      }
      requestAnimationFrame(tick);
    }
  };
  const select = (e, play = true) => {
    if (!evs.includes(e)) { ui.rEvent = evKey(e); $$(".evrow").forEach((r) => r.classList.toggle("sel", r.dataset.ev === ui.rEvent)); renderEvDetail(); loadMatch(); return; }
    ui.rEvent = evKey(e); target = e;
    $$(".evrow").forEach((r) => r.classList.toggle("sel", r.dataset.ev === ui.rEvent));
    $$(".mk", box).forEach((m) => m.classList.toggle("on", m.dataset.mk === ui.rEvent));
    v.currentTime = tOf(e.frame - LEAD); if (play) v.play();
    renderEvDetail();
  };
  v.addEventListener("play", () => requestAnimationFrame(tick));
  v.addEventListener("seeked", tick); v.addEventListener("loadeddata", () => { tick(); const e = evs.find((x) => evKey(x) === ui.rEvent); if (e) select(e, !!clipEv); });
  const step = (n) => { v.pause(); target = null; v.currentTime = Math.max(0, Math.min(v.duration || 1e4, v.currentTime + n / 60)); };
  const jump = (dir) => {
    const f = fOf(), i = evs.findIndex((x) => evKey(x) === ui.rEvent);
    const list = clipEv ? allEvs : evs, j = list.findIndex((x) => evKey(x) === ui.rEvent);
    const e = j >= 0 && Math.abs(list[j].frame - f) <= LEAD + TAIL + 60 ? list[j + dir] : dir > 0 ? list.find((x) => x.frame > f) : [...list].reverse().find((x) => x.frame < f);
    if (e) select(e);
  };
  $("[data-p=play]", box).onclick = () => (v.paused ? v.play() : v.pause());
  $("[data-p=back]", box).onclick = () => step(-1);
  $("[data-p=fwd]", box).onclick = () => step(1);
  $("[data-p=nextEv]", box).onclick = () => jump(1);
  $("[data-p=prevEv]", box).onclick = () => jump(-1);
  $$("[data-rate]", box).forEach((b) => b.onclick = () => { ui.rate = +b.dataset.rate; v.playbackRate = ui.rate; $$("[data-rate]", box).forEach((x) => x.classList.toggle("on", x === b)); });
  $("[data-evonly]", box).onchange = (e) => { ui.evOnly = e.target.checked; };
  $("[data-stop]", box).onchange = (e) => { ui.stopAt = e.target.checked; };
  $$(".mk", box).forEach((m) => m.onclick = (ev) => { ev.stopPropagation(); const e = evs.find((x) => evKey(x) === m.dataset.mk); if (e) select(e); });
  // YouTube-style scrubbing: press anywhere on the bar and drag; the video follows the mouse
  const xToT = (x) => { const r = scrub.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * (len / 60); };
  const showAt = (t) => { const f = Math.round(t * 60) + meta.start; head.style.left = at(f); played.style.width = at(f); itl.draw(f); };
  let dragging = false, resume = false, seekT = null, seeking = false;
  const seek = (t) => { seekT = t; showAt(t); if (seeking) return; seeking = true;
    const go = () => { const t2 = seekT; seekT = null; v.currentTime = t2; v.addEventListener("seeked", () => { if (seekT != null) go(); else seeking = false; }, { once: true }); }; go(); };
  scrub.onpointerdown = (e) => { if (e.button !== 0 || e.target.closest(".mk")) return; e.preventDefault(); dragging = true; target = null;
    resume = !v.paused; v.pause(); scrub.classList.add("drag"); try { scrub.setPointerCapture(e.pointerId); } catch {} seek(xToT(e.clientX)); };
  scrub.onpointermove = (e) => { const t = xToT(e.clientX), r = scrub.getBoundingClientRect();
    tip.hidden = false; tip.textContent = ftime(Math.round(t * 60) + meta.start); tip.style.left = `${Math.max(0, Math.min(r.width, e.clientX - r.left))}px`;
    if (dragging) seek(t); };
  scrub.onpointerleave = () => { if (!dragging) tip.hidden = true; };
  scrub.onpointerup = scrub.onpointercancel = (e) => { if (!dragging) return; dragging = false; scrub.classList.remove("drag"); tip.hidden = true; seek(xToT(e.clientX ?? 0)); if (resume) v.play(); };
  // volume
  const vol = $("[data-vol]", box), mb = $("[data-p=mute]", box);
  const icon = () => { const m = v.muted || v.volume === 0; mb.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>${m ? '<path d="M17 9l5 6M22 9l-5 6"/>' : v.volume < 0.5 ? '<path d="M16.5 9.5a3.5 3.5 0 0 1 0 5"/>' : '<path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>'}</svg>`;
    mb.setAttribute("aria-label", m ? "Unmute" : "Mute"); mb.title = (m ? "Unmute" : "Mute") + " (M)"; vol.value = m ? 0 : v.volume; vol.style.setProperty("--v", (m ? 0 : v.volume) * 100 + "%"); };
  let volSave = null; const saveVol = () => { clearTimeout(volSave); volSave = setTimeout(() => api.setConfig({ clipVolume: v.volume, clipMuted: v.muted }).then((c) => (cfg = c)), 400); };
  v.volume = cfg.clipVolume ?? 1; v.muted = !!cfg.clipMuted; icon();
  vol.oninput = () => { const x = +vol.value; if (x === 0) v.muted = true; else { v.muted = false; v.volume = x; } icon(); saveVol(); };
  const toggleMute = () => { if (v.muted || v.volume === 0) { v.muted = false; if (v.volume === 0) v.volume = 0.5; } else v.muted = true; icon(); saveVol(); };
  mb.onclick = toggleMute;
  const fs = () => { if (document.fullscreenElement) document.exitFullscreen(); else box.requestFullscreen().then(() => box.focus()).catch(() => {}); };
  $("[data-p=fs]", box).onclick = fs;
  v.ondblclick = fs;
  // drag the bar under the video to resize it; the size is remembered
  const vr = $(".vresize", box), pl = $(".player", box);
  const setH = (vh, save) => { vh = Math.max(25, Math.min(85, Math.round(vh))); pl.style.setProperty("--player-h", vh + "vh"); if (save) api.setConfig({ playerH: vh }).then((c) => (cfg = c)); return vh; };
  vr.onpointerdown = (e) => { e.preventDefault(); try { vr.setPointerCapture(e.pointerId); } catch {} const y0 = e.clientY, h0 = pl.getBoundingClientRect().height; let vh = cfg.playerH || 60;
    vr.onpointermove = (m) => { vh = setH(((h0 + m.clientY - y0) / innerHeight) * 100); };
    vr.onpointerup = () => { vr.onpointermove = vr.onpointerup = null; setH(vh, true); }; };
  vr.ondblclick = () => setH(60, true);
  vr.onkeydown = (e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); setH((cfg.playerH || 60) + (e.key === "ArrowDown" ? 5 : -5), true); } };
  box.tabIndex = -1;
  box.onkeydown = (e) => { if (e.target.matches("input")) return; if (e.key === "f" || e.key === "F") { fs(); e.preventDefault(); return; } if (e.key === "m" || e.key === "M") { toggleMute(); e.preventDefault(); return; } if (e.key === "," || e.key === "ArrowLeft") { step(-1); e.preventDefault(); } else if (e.key === "." || e.key === "ArrowRight") { step(1); e.preventDefault(); } else if (e.key === " ") { v.paused ? v.play() : v.pause(); e.preventDefault(); } };
  const rb = $("[data-record]", box);
  if (rb) rb.onclick = async () => { clipState[fullKey] = { state: "queued" }; rb.outerHTML = `<span class="sub end">Full match recording queued</span>`;
    const r = await api.renderClip({ gameId: gid, frame: "full" }); if (!r.ok) clipState[fullKey] = { state: "error", error: r.error }; };
  player = { gid, key: clipEv ? `${gid}_${clipEv.frame}` : fullKey, select: (k) => { const e = allEvs.find((x) => evKey(x) === k); if (e) select(e); } };
}
function evDetailHtml(sel) {
  if (!sel) return "";
  const good = sel.type === "good";
  return `<section class="card evdetail ${good ? "is-good" : ""}"><div class="card-head"><i class="evdot" style="background:${EV[sel.type].color}"></i><b>${esc(sel.label)}</b>
      <span class="sub">${ftime(sel.frame)} · stock ${sel.stock} · ${esc(sel.sub)}</span>${sel.moment ? `<span class="tag ${sevTag(sel.moment)} end">${esc(sel.moment.tag.toUpperCase())}</span>` : good ? `<span class="tag good end">${esc(hlTag(sel.hl))}</span>` : ""}</div>
    <div class="grid2" style="margin-top:10px">${sel.moment ? `<div><div class="eyebrow bad">WHAT HAPPENED</div><p>${esc(sel.moment.detail)}</p></div>` : ""}
      <div><div class="eyebrow good">${good ? "WHY IT WORKED" : "TRY INSTEAD"}</div><p>${evTip(sel)}</p></div></div></section>`;
}
// ------------------------------------------------------------------ input timeline
// Lanes of your own inputs and action state, 3 seconds around the playhead, one column per frame.
const LANES = [
  ["State", null], ["L / R", (d, i) => (d.btn[i] & 0x60 ? 2 : Math.max(d.lt[i], d.rt[i]) >= 30 ? 1 : 0)], ["Z", (d, i) => (d.btn[i] & 0x10 ? 2 : 0)],
  ["A", (d, i) => (d.btn[i] & 0x100 ? 2 : 0)], ["B", (d, i) => (d.btn[i] & 0x200 ? 2 : 0)], ["Jump", (d, i) => (d.btn[i] & 0xc00 ? 2 : 0)],
  ["Stick ↓", (d, i) => (d.sy[i] <= -66 ? 2 : 0)],
];
function stateColor(a, air) {
  if (a >= 65 && a <= 69) return "#f0883e";          // aerial attack
  if (a >= 70 && a <= 74) return "#ef6461";          // aerial landing lag
  if (a >= 75 && a <= 91) return "#b03a48";          // hitstun
  if (a >= 183 && a <= 197) return "#7a2a33";        // missed tech, lying, getup
  if (a >= 199 && a <= 201) return "#21d0bf";        // tech
  if (a >= 44 && a <= 47) return "#b48cf2";          // jabs
  if (a >= 178 && a <= 182) return "#5b7cfa";        // shield
  if (a >= 236 && a <= 236) return "#9fd3f0";        // airdodge
  if (a < 0) return "transparent";
  return air ? "#3b4150" : "#2c2e35";
}
const STATE_NAMES = (a) => (a >= 65 && a <= 69 ? "aerial" : a >= 70 && a <= 74 ? "landing lag" : a >= 75 && a <= 91 ? "hitstun" : a >= 199 && a <= 201 ? "tech"
  : a >= 183 && a <= 197 ? "missed tech / getup" : a >= 44 && a <= 47 ? "jab" : a >= 178 && a <= 182 ? "shield" : a === 236 ? "airdodge" : "");
function inputTimeline(cv, gid, meta, g, evs) {
  const W = 180, ctx = cv.getContext("2d"); let data = null, loading = false, lastF = null;
  const fetch = async (f) => {
    if (loading) return; loading = true;
    const a = Math.max(meta.start, f - 400), b = Math.min(meta.end, f + 400);
    const d = await api.inputs({ gameId: gid, start: a, end: b }); loading = false;
    if (d) { data = d; draw(lastF ?? f, true); }
  };
  const marks = (evs || []).filter((e) => e.type === "lcancel" || e.type === "tech");
  function draw(f, force) {
    if (!cv.isConnected) return;
    if (f === lastF && !force) return; lastF = f;
    if (!data || f - 100 < data.start || f + 100 > data.start + data.n - 1) fetch(f);
    const dpr = window.devicePixelRatio || 1, cw = cv.clientWidth; if (!cw) return;
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(150 * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, 150);
    const labelW = 58, gw = cw - labelW, colW = gw / W, f0 = f - Math.floor(W / 2), rowH = 17, top = 14;
    const x = (fr) => labelW + (fr - f0) * colW;
    // windows and landings
    for (const e of marks) {
      if (e.frame < f0 - 25 || e.frame > f0 + W + 1) continue;
      const len = e.type === "lcancel" ? 7 : 20;
      ctx.fillStyle = e.type === "lcancel" ? "rgba(33,208,191,.18)" : "rgba(241,194,50,.16)";
      ctx.fillRect(x(e.frame - len), top, len * colW, rowH * LANES.length);
      ctx.fillStyle = "#ef6461"; ctx.fillRect(x(e.frame), top, Math.max(2, colW * 0.35), rowH * LANES.length);
    }
    ctx.font = "11px Inter, system-ui, sans-serif"; ctx.textBaseline = "middle";
    LANES.forEach(([name, fn], li) => {
      const y = top + li * rowH;
      ctx.fillStyle = "#8b8d96"; ctx.fillText(name, 4, y + rowH / 2);
      ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fillRect(labelW, y + 1, gw, rowH - 2);
      if (!data) return;
      for (let k = 0; k < W; k++) {
        const fr = f0 + k, i = fr - data.start; if (i < 0 || i >= data.n) continue;
        if (!fn) { const c = stateColor(data.act[i], data.air[i]); if (c === "transparent") continue; ctx.fillStyle = c; ctx.fillRect(x(fr), y + 2, Math.ceil(colW), rowH - 4); continue; }
        const v = fn(data, i); if (!v) continue;
        ctx.fillStyle = v === 2 ? "#e9eaee" : "rgba(233,234,238,.4)";
        ctx.fillRect(x(fr) + (colW > 3 ? 0.5 : 0), y + 4, Math.max(1, colW - (colW > 3 ? 1 : 0)), rowH - 8);
      }
    });
    // ruler (frames from the playhead) and playhead
    ctx.fillStyle = "#5c5f68";
    for (let k = -90; k <= 90; k += 10) { const xx = x(f + k); if (xx < labelW) continue; ctx.fillRect(xx, top + rowH * LANES.length + 2, 1, 4);
      if (k % 30 === 0) { ctx.fillStyle = "#8b8d96"; ctx.fillText(k === 0 ? "0" : (k > 0 ? "+" : "") + k, xx - 8, top + rowH * LANES.length + 14); ctx.fillStyle = "#5c5f68"; } }
    ctx.fillStyle = "#e9eaee"; ctx.fillRect(x(f) + colW / 2 - 0.5, 4, 1.5, rowH * LANES.length + 12);
    // what you're doing on this frame
    if (data) { const i = f - data.start; const nm = i >= 0 && i < data.n ? STATE_NAMES(data.act[i]) : "";
      ctx.fillStyle = "#c9cad1"; ctx.fillText(nm, x(f) + 6, 6); }
  }
  return { draw };
}

function renderEvDetail() {
  // re-render only the detail card without rebuilding the player
  const g = cache.get(ui.rGame); if (!g) return;
  const sel = gameEvents(g).find((e) => evKey(e) === ui.rEvent); const old = $(".evdetail");
  const html = evDetailHtml(sel);
  if (old) old.outerHTML = html || ""; else if (html) $(".rvside")?.insertAdjacentHTML("afterbegin", html);
}
async function markRecorded() {
  for (const el of $$("[data-vid]")) { const i = await api.clipInfo({ gameId: el.dataset.vid, frame: "full" }); el.classList.toggle("on", i.has); }
}

// Sessions grouped by month, with a divider for each day (newest first).
function sessionNav(sessList) {
  const months = [];
  for (const s of sessList) {
    const d = new Date(s.start); const mk = `${d.getFullYear()}-${d.getMonth()}`;
    let m = months[months.length - 1];
    if (!m || m.key !== mk) months.push(m = { key: mk, label: d.toLocaleDateString([], { month: "long", year: "numeric" }), days: [], games: 0 });
    const dk = d.toDateString();
    let dd = m.days[m.days.length - 1];
    if (!dd || dd.key !== dk) m.days.push(dd = { key: dk, label: d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }), sessions: [] });
    dd.sessions.push(s); m.games += s.games.length;
  }
  const selMonth = (() => { const d = new Date(ui.session); return `${d.getFullYear()}-${d.getMonth()}`; })();
  return `<nav class="snav" aria-label="Sessions">${months.map((m) => `
    <details ${m.key === selMonth || ui.openMonths?.[m.key] ? "open" : ""} data-month="${m.key}">
      <summary><span class="chev">›</span><span class="mname">${esc(m.label)}</span><span class="sub">${m.games} games</span></summary>
      ${m.days.map((d) => `<div class="sday"><span>${esc(d.label)}</span></div>
        ${d.sessions.map((s) => { const r = record(s.games.filter((g) => g.complete !== false)); const n = s.games.reduce((a, g) => a + (g.moments?.length || 0), 0);
          return `<button class="srow ${s.start === ui.session ? "sel" : ""}" data-sess="${esc(s.start)}">
            <span class="st">${clock(s.start)}${s.games.length > 1 ? `–${clock(s.end)}` : ""}</span>
            <span class="sub">${s.games.length} game${s.games.length > 1 ? "s" : ""} · ${r.w}–${r.l} · ${n} moment${n === 1 ? "" : "s"}</span></button>`; }).join("")}`).join("")}
    </details>`).join("")}</nav>`;
}

function currentMoment() {
  if (!ui.momentKey) return null; const [gid, f, type] = ui.momentKey.split("|");
  const g = games.find((x) => x.id === gid); return g?.moments?.find((m) => String(m.frame) === f && m.type === type) || null;
}
async function renderClipCheck() {
  const el = $("#clipCheck"); if (!el) return;
  const c = await api.clipCheck();
  el.innerHTML = c.ok ? `<span class="good">● Ready</span> <span class="sub">· ${c.count} clip${c.count === 1 ? "" : "s"} saved · ISO: ${esc(c.iso)}${c.fastOk ? "" : " · fast recording didn't check out on this PC, so recordings run at normal speed"}</span>`
    : `<span class="bad">● Not ready</span><div class="sub" style="margin-top:4px">${c.problems.map(esc).join("<br>")}</div>`;
}

function tryInstead(m) {
  if (m.type === "lcancel") return m.timing === "early" ? "Press L as you're about to touch the ground, not as the aerial comes out. A cancelled landing halves the lag."
    : m.timing === "late" ? "Press L a hair sooner: the press has to come in the 7 frames before you land." : "Build the habit of pressing L on every aerial that lands, even when it feels safe.";
  if (m.type === "tech") return "Tech the landing: press L/R just before you hit the ground, and mix in place, left and right.";
  return "Break the pattern: after two of the same option, pick a different one.";
}

// ------------------------------------------------------------------ HIGHLIGHTS
const HL_KINDS = [["all", "All"], ["kill", "Kills"], ["combo", "Combos"], ["exec", "Execution"], ["clutch", "Comebacks & 4-stocks"]];
const hlKind = (h) => (h.kind === "string" ? (h.killed ? "kill" : "combo") : h.kind === "comeback" || h.kind === "4stock" ? "clutch" : "exec");
const hlWatchable = (h) => !!h.end || h.kind === "comeback";
function renderHighlights() {
  ui.hlKind ||= "all";
  const all = byOpp(games).flatMap((g) => (g.highlights || []).map((h) => ({ ...h, g })));
  const counts = Object.fromEntries(HL_KINDS.map(([k]) => [k, k === "all" ? all.length : all.filter((h) => hlKind(h) === k).length]));
  const list = all.filter((h) => ui.hlKind === "all" || hlKind(h) === ui.hlKind)
    .sort((a, b) => b.g.startedAt.localeCompare(a.g.startedAt) || b.score - a.score).slice(0, 300);
  const byDay = []; for (const h of list) { const d = day(h.g.startedAt); const last = byDay[byDay.length - 1]; if (last && last.d === d) last.l.push(h); else byDay.push({ d, l: [h] }); }
  return `<div class="page">${liveStrip()}
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div><h1 style="margin:0;font-size:22px">Highlights</h1><div class="sub">What you did well, newest first · ${all.length} total</div></div>
      <span class="end">${oppSelect()}</span></div>
    <div class="evchips" role="group" aria-label="Kind">${HL_KINDS.map(([k, l]) => `<button class="evchip ${ui.hlKind === k ? "on" : ""}" data-hlk="${k}" aria-pressed="${ui.hlKind === k}">${l}<b>${counts[k]}</b></button>`).join("")}</div>
    ${byDay.length ? byDay.map(({ d, l }) => `<section class="hlday"><div class="hlhead"><b>${esc(d)}</b><span class="sub">${l.length} highlight${l.length === 1 ? "" : "s"}</span></div>
      <div class="hlgrid">${l.map((h) => `<div class="hlcard">
        <div class="hltop"><span class="tag good">${esc(hlTag(h))}</span><span class="hlclip" data-hlclip="${esc(h.g.id)}|${h.frame}" title="Clip ready" hidden>● clip ready</span><span class="sub end">${clock(h.g.startedAt)}</span></div>
        <b class="hlt">${esc(h.title)}</b><p class="sub">${esc(h.detail)}</p>
        <div class="hlfoot">${chip(h.g.oppChar, 22)}<span class="sub">vs ${esc(h.g.oppChar)} · ${esc(h.g.stage)}${hlWatchable(h) ? ` · ${ftime(h.frame)}` : ""}</span>
          ${hlWatchable(h) ? `<button class="btn primary end" data-hl="${esc(h.g.id)}|${h.frame}">Watch</button>` : `<button class="btn end" data-hlgame="${esc(h.g.id)}">Open match</button>`}</div></div>`).join("")}</div></section>`).join("")
      : `<div class="card empty">No highlights${ui.opp ? ` vs ${esc(ui.opp)}` : ""} yet.</div>`}
    ${all.length > 300 && list.length === 300 ? `<div class="sub" style="text-align:center">Showing the latest 300.</div>` : ""}
  </div>`;
}
async function markHlClips() {
  for (const el of $$("[data-hlclip]").slice(0, 80)) { const [gid, f] = el.dataset.hlclip.split("|");
    const [a, b] = await Promise.all([api.clipInfo({ gameId: gid, frame: +f }), api.clipInfo({ gameId: gid, frame: "full" })]);
    el.hidden = !(a.has || b.has); }
}

// ------------------------------------------------------------------ MATCHUPS
const muNotes = (c) => window.MATCHUPS?.[c] || window.MATCHUP_GENERIC;
function muCard(c, compact) {
  const n = muNotes(c);
  if (compact) return `<section class="card"><div class="card-head">${chip(c, 26)}<h2>Vs ${esc(c)}</h2><button class="linkbtn end" data-mu="${esc(c)}">All notes →</button></div>
    <p class="sub" style="margin:6px 0 8px;line-height:1.5">${esc(n.feel)}</p>
    <ul class="tips">${n.plan.slice(0, 2).map((t) => `<li>${esc(t)}</li>`).join("")}<li class="avoid">${esc(n.avoid[0])}</li></ul></section>`;
  const sec = (title, list, cls = "") => list?.length ? `<div class="musec ${cls}"><div class="eyebrow">${title}</div><ul class="tips">${list.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "";
  return `<section class="card"><div class="card-head"><h2>Tips & tricks</h2><span class="sub">general Falcon game plan vs ${esc(c)}</span></div>
    <p style="margin:8px 0 4px;line-height:1.55;color:#d4d5da">${esc(n.feel)}</p>
    <div class="mugrid">${sec("GAME PLAN", n.plan)}${sec("PUNISHES & KILLS", n.punish)}${sec("EDGEGUARDING", n.edge)}${sec("AVOID", n.avoid, "bad")}</div>
    ${n.drill ? `<div class="drill"><span class="sub">Drill</span><span>${esc(n.drill)}</span></div>` : ""}</section>`;
}
function topCounts(list, k = 4) { const o = {}; for (const x of list) o[x] = (o[x] || 0) + 1; return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k); }
// ---- opponents by connect code
function playerList() {
  const by = {}; for (const g of games) { if (!g.oppCode || g.vsCpu) continue; (by[g.oppCode] ||= []).push(g); }
  return Object.entries(by).map(([code, l]) => ({ code, l, name: l.find((g) => g.oppName)?.oppName || "", r: record(l.filter((g) => g.complete !== false)) })).sort((a, b) => b.l.length - a.l.length);
}
function mergeCounts(objs) { const o = {}; for (const x of objs) for (const [k, v] of Object.entries(x || {})) o[k] = (o[k] || 0) + v; return o; }
function renderPlayers() {
  const ps = playerList();
  if (!ui.player || !ps.some((p) => p.code === ui.player)) ui.player = ps[0]?.code;
  const p = ps.find((x) => x.code === ui.player);
  const head = muToggle();
  if (!p) return `<div class="page">${head}<div class="card empty">No online opponents yet.</div></div>`;
  const l = p.l, wr = pct(p.r.w, p.r.w + p.r.l);
  const chars = topCounts(l.map((g) => g.oppChar), 6);
  const H = { techs: l.reduce((a, g) => a + (g.oppHabits?.techs || 0), 0), missed: l.reduce((a, g) => a + (g.oppHabits?.missedTechs || 0), 0),
    tech: mergeCounts(l.map((g) => g.oppHabits?.tech)), getups: mergeCounts(l.map((g) => g.oppHabits?.getups)), ledge: mergeCounts(l.map((g) => g.oppHabits?.ledge)) };
  const tracked = l.filter((g) => g.oppHabits).length;
  const killedBy = topCounts(l.flatMap((g) => g.killedBy || [])), killsWith = topCounts(l.flatMap((g) => g.killsWith || []));
  const deaths = l.reduce((a, g) => a + (g.killedBy || []).length, 0), kills = l.reduce((a, g) => a + (g.killsWith || []).length, 0);
  const hls = l.flatMap((g) => (g.highlights || []).map((h) => ({ ...h, g }))).sort((a, b) => b.score - a.score).slice(0, 5);
  const share = (o, k) => { const t = Object.values(o).reduce((a, b) => a + b, 0); return t ? Math.round((100 * (o[k] || 0)) / t) : 0; };
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
  // reads: plain-language tendencies worth exploiting
  const reads = [];
  const techTotal = H.techs + H.missed;
  if (techTotal >= 5 && H.missed / techTotal >= 0.4) reads.push(`Misses ${Math.round((100 * H.missed) / techTotal)}% of techs (${H.missed} of ${techTotal}). Tech-chase them: knockdowns are free follow-ups.`);
  const tt = top(H.tech); if (tt && H.techs >= 4 && share(H.tech, tt[0]) >= 60) reads.push(`When they tech, it's usually ${tt[0]} (${share(H.tech, tt[0])}%).`);
  const tg = top(H.getups); if (tg && Object.values(H.getups).reduce((a, b) => a + b, 0) >= 4 && share(H.getups, tg[0]) >= 50) reads.push(`From the ground they pick ${tg[0]} ${share(H.getups, tg[0])}% of the time. Cover that first.`);
  const tl = top(H.ledge); if (tl && Object.values(H.ledge).reduce((a, b) => a + b, 0) >= 4 && share(H.ledge, tl[0]) >= 50) reads.push(`On ledge they go for ${tl[0]} ${share(H.ledge, tl[0])}% of the time.`);
  if (killedBy[0] && deaths >= 3) reads.push(`${killedBy[0][1]} of your ${deaths} deaths to them were ${killedBy[0][0]}. Respect its range at high percent.`);
  if (killsWith[0] && kills >= 3) reads.push(`Your best finisher on them: ${killsWith[0][0]} (${killsWith[0][1]} of ${kills} kills).`);
  const note = (cfg.playerNotes || {})[p.code] || "";
  const bars = (rows, total, color) => rows.length ? rows.map(([k, n]) => `<div class="kbar"><span>${esc(k)}</span><span class="track"><i style="width:${(100 * n) / Math.max(1, total)}%;background:${color}"></i></span><b>${n}</b></div>`).join("") : `<div class="sub">No data yet.</div>`;
  const obars = (o) => { const e = Object.entries(o).sort((a, b) => b[1] - a[1]); return bars(e, e.reduce((a, [, n]) => a + n, 0), "var(--yellow)"); };
  return `<div class="page">${liveStrip()}${head}
    <div class="review">
      <nav class="mulist" aria-label="Players">${ps.map((x) => { const w = pct(x.r.w, x.r.w + x.r.l);
        return `<button class="murow ${x.code === p.code ? "sel" : ""}" data-player="${esc(x.code)}">${chip(topCounts(x.l.map((g) => g.oppChar), 1)[0]?.[0] || "?", 26)}
          <span style="flex:1;min-width:0"><b>${esc(x.name || x.code)}</b><span class="sub">${esc(x.code)} · ${x.l.length} game${x.l.length === 1 ? "" : "s"} · ${x.r.w}–${x.r.l}</span></span>
          <span class="wr" style="color:${w == null ? "var(--muted)" : w >= 50 ? "var(--teal)" : "var(--red)"}">${w == null ? "–" : w + "%"}</span></button>`; }).join("")}</nav>
      <div class="mdetail">
        <section class="card"><div class="card-head">${chip(chars[0]?.[0] || "?", 40)}<div><h2 style="margin:0">${esc(p.name || p.code)}</h2>
          <span class="sub">${esc(p.code)} · ${l.length} game${l.length === 1 ? "" : "s"} · last played ${day(l[0].startedAt)} · plays ${chars.map(([c, n]) => `${esc(c)} (${n})`).join(", ")}</span></div>
          <div class="end murec"><b style="color:${(wr ?? 0) >= 50 ? "var(--teal)" : "var(--red)"}">${p.r.w}–${p.r.l}</b><span class="sub">${wr ?? "–"}% wins</span></div></div></section>
        ${reads.length ? `<section class="card"><div class="card-head"><h2>Reads on ${esc(p.name || p.code)}</h2><span class="sub">from ${tracked} analysed game${tracked === 1 ? "" : "s"}</span></div><ul class="tips mine">${reads.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></section>` : ""}
        <div class="grid2">
          <section class="card"><div class="card-head"><h2>Their tech &amp; getups</h2><span class="sub">${techTotal} hard knockdowns</span></div><div style="margin-top:10px">${obars({ ...H.tech, "missed tech": H.missed })}</div>
            <div class="eyebrow" style="margin-top:12px">GETUPS</div>${obars(H.getups)}</section>
          <section class="card"><div class="card-head"><h2>Their ledge options</h2></div><div style="margin-top:10px">${obars(H.ledge)}</div></section>
          <section class="card"><div class="card-head"><h2>How you lose stocks</h2><span class="sub">${deaths} deaths</span></div><div style="margin-top:10px">${bars(killedBy, deaths, "var(--red)")}</div></section>
          <section class="card"><div class="card-head"><h2>How you take stocks</h2><span class="sub">${kills} kills</span></div><div style="margin-top:10px">${bars(killsWith, kills, "var(--teal)")}</div></section>
        </div>
        <section class="card"><div class="card-head"><h2>Your notes</h2><span class="sub">anything to remember for next time</span></div>
          <textarea class="r2notes" data-pnote="${esc(p.code)}" placeholder="e.g. Always shields after landing. Rolls in from ledge at high percent.">${esc(note)}</textarea></section>
        ${hls.length ? `<section class="card"><div class="card-head"><h2>Your best plays vs ${esc(p.name || p.code)}</h2></div><div class="wlist">${hls.map((h) => `
          <button class="wrow" data-hl="${esc(h.g.id)}|${h.frame}"><span class="tag good">${esc(hlTag(h))}</span><span style="min-width:0;flex:1"><b>${esc(h.title)}</b><span class="sub">${day(h.g.startedAt)} · ${esc(h.g.oppChar)} · ${esc(h.detail)}</span></span><span class="sub">Watch →</span></button>`).join("")}</div></section>` : ""}
      </div></div></div>`;
}
function muToggle() {
  return `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><div><h1 style="margin:0;font-size:22px">Matchups</h1><div class="sub">${ui.muMode === "players" ? "Players you've faced online, by connect code" : "Your record, your numbers and Falcon notes for every character"}</div></div>
    <div class="seg end" role="group" aria-label="View"><button class="${ui.muMode !== "players" ? "on" : ""}" data-mumode="chars">Characters</button><button class="${ui.muMode === "players" ? "on" : ""}" data-mumode="players">Players</button></div></div>`;
}

function renderMatchups() {
  if (ui.muMode === "players") return renderPlayers();
  const by = {}; for (const g of games) (by[g.oppChar] ||= []).push(g);
  const played = Object.entries(by).sort((a, b) => b[1].length - a[1].length);
  const others = Object.keys(CHIP).filter((c) => !by[c] && c !== "Falcon" || (c === "Falcon" && !by[c])).sort();
  if (!ui.mu || (!by[ui.mu] && !CHIP[ui.mu])) ui.mu = played[0]?.[0] || "Fox";
  const c = ui.mu, list = by[c] || [], done = list.filter((g) => g.complete !== false);
  const r = record(done), wr = pct(r.w, r.w + r.l);
  const mine = metricVals(aggSummaries(list)), all = metricVals(aggSummaries(games));
  const keys = ["lc", "tech", "neutral", "opk", "dpo"];
  const oppOpk = (() => { const t = aggSummaries(list); return t.deaths ? +(t.oppOpenings / t.deaths).toFixed(1) : null; })();
  const killedBy = topCounts(list.flatMap((g) => g.killedBy || [])), killsWith = topCounts(list.flatMap((g) => g.killsWith || []));
  const deaths = list.reduce((a, g) => a + (g.killedBy || []).length, 0), kills = list.reduce((a, g) => a + (g.killsWith || []).length, 0);
  const hls = list.flatMap((g) => (g.highlights || []).map((h) => ({ ...h, g }))).sort((a, b) => b.score - a.score).slice(0, 6);
  // personal notes from the numbers
  const notes = [];
  for (const k of keys) { const m = metric(k), a = mine[k], b = all[k]; if (a == null || b == null || list.length < 3) continue;
    const better = m.good === "up" ? a > b : a < b, gap = Math.abs(a - b);
    if (gap >= (m.unit === "%" ? 6 : 1)) notes.push({ good: better, text: `${m.name} vs ${c}: ${a}${m.unit} (${b}${m.unit} overall).` }); }
  if (killedBy[0] && deaths >= 3 && killedBy[0][1] / deaths >= 0.35) notes.push({ good: false, text: `${killedBy[0][1]} of your ${deaths} deaths vs ${c} were to ${killedBy[0][0]}. Learn its range and stay out of it at high percent.` });
  if (killsWith[0] && kills >= 3) notes.push({ good: true, text: `Your go-to finisher vs ${c} is ${killsWith[0][0]} (${killsWith[0][1]} of ${kills} kills).` });
  const bars = (rows, total, color) => rows.length ? rows.map(([k, n]) => `<div class="kbar"><span>${esc(k)}</span><span class="track"><i style="width:${(100 * n) / Math.max(1, total)}%;background:${color}"></i></span><b>${n}</b></div>`).join("") : `<div class="sub">No data yet.</div>`;
  return `<div class="page">${liveStrip()}
    ${muToggle()}
    <div class="review">
      <nav class="mulist" aria-label="Characters">
        <div class="sub" style="text-transform:uppercase;letter-spacing:.6px">Played</div>
        ${played.map(([k, l]) => { const rr = record(l.filter((g) => g.complete !== false)); const w = pct(rr.w, rr.w + rr.l);
          return `<button class="murow ${k === c ? "sel" : ""}" data-mu="${esc(k)}">${chip(k, 26)}<span style="flex:1;min-width:0"><b>${esc(k)}</b><span class="sub">${l.length} game${l.length === 1 ? "" : "s"} · ${rr.w}–${rr.l}</span></span>
            <span class="wr" style="color:${w == null ? "var(--muted)" : w >= 50 ? "var(--teal)" : "var(--red)"}">${w == null ? "–" : w + "%"}</span></button>`; }).join("")}
        <details ${by[c] ? "" : "open"}><summary class="sub" style="text-transform:uppercase;letter-spacing:.6px;margin-top:10px">Not played yet</summary>
          ${others.map((k) => `<button class="murow ${k === c ? "sel" : ""}" data-mu="${esc(k)}">${chip(k, 22)}<span style="flex:1"><b>${esc(k)}</b></span></button>`).join("")}</details>
      </nav>
      <div class="mdetail">
        <section class="card"><div class="card-head">${chip(c, 40)}<div><h2 style="margin:0">Falcon vs ${esc(c)}</h2>
          <span class="sub">${list.length ? `${list.length} game${list.length === 1 ? "" : "s"} · last played ${day(list[0].startedAt)}` : "No games yet"}</span></div>
          ${list.length ? `<div class="end murec"><b style="color:${wr >= 50 ? "var(--teal)" : "var(--red)"}">${r.w}–${r.l}</b><span class="sub">${wr ?? "–"}% wins</span></div>` : ""}</div>
          ${list.length ? `<div class="mustats">${keys.map((k) => { const m = metric(k), v = mine[k], o = all[k]; const tn = tone(m, v);
            return `<div class="stat"><span>${m.name}</span><b style="color:${toneColor[tn]}">${fmt(v, m.unit)}</b><span class="sub">${fmt(o, m.unit)} overall</span></div>`; }).join("")}
            <div class="stat"><span>Their openings per kill</span><b>${fmt(oppOpk)}</b><span class="sub">higher is better for you</span></div></div>` : ""}
        </section>
        ${notes.length ? `<section class="card"><div class="card-head"><h2>From your games</h2></div><ul class="tips mine">${notes.map((n) => `<li class="${n.good ? "good" : "bad"}">${esc(n.text)}</li>`).join("")}</ul></section>` : ""}
        ${list.length ? `<div class="grid2">
          <section class="card"><div class="card-head"><h2>How you lose stocks</h2><span class="sub">${deaths} deaths</span></div><div style="margin-top:10px">${bars(killedBy, deaths, "var(--red)")}</div></section>
          <section class="card"><div class="card-head"><h2>How you take stocks</h2><span class="sub">${kills} kills</span></div><div style="margin-top:10px">${bars(killsWith, kills, "var(--teal)")}</div></section></div>` : ""}
        ${muCard(c, false)}
        ${hls.length ? `<section class="card"><div class="card-head"><h2>Your best plays vs ${esc(c)}</h2></div><div class="wlist">${hls.map((h) => `
          <button class="wrow" data-hl="${esc(h.g.id)}|${h.frame}"><span class="tag good">${esc(hlTag(h))}</span><span style="min-width:0;flex:1"><b>${esc(h.title)}</b><span class="sub">${day(h.g.startedAt)} · ${esc(h.g.stage)} · ${esc(h.detail)}</span></span><span class="sub">Watch →</span></button>`).join("")}</div></section>` : ""}
      </div></div></div>`;
}

// ------------------------------------------------------------------ PROGRESS
// ------------------------------------------------------------------ TRAINING PLAN
// One focus per week, picked from the stat furthest below its target. Practice games vs a CPU count separately.
const realGames = () => games.filter((g) => !g.vsCpu && g.complete !== false);
function shortfall(m, v) { const t = target(m); if (v == null || t == null) return null; return m.good === "up" ? (t - v) / Math.max(1, t) : (v - t) / Math.max(1, t); }
function pickFocus(list) {
  const t = aggSummaries(list), vals = metricVals(t);
  let best = null;
  for (const m of METRICS) { if (!m.min(t)) continue; const sf = shortfall(m, vals[m.key]); if (sf != null && (!best || sf > best.sf)) best = { key: m.key, sf, v: vals[m.key] }; }
  return best;
}
async function ensureFocus() {
  const now = Date.now(), f = cfg.focus;
  if (f && (!f.auto || now - Date.parse(f.since) < 7 * 864e5)) return f;
  const recent = realGames().slice(0, 30); if (recent.length < 5) return f || null;
  const p = pickFocus(recent); if (!p) return f || null;
  const hist = (cfg.focusHistory || []).slice(-20);
  if (f) hist.push({ ...f, until: new Date().toISOString(), end: focusValue(f).v });
  const nf = { key: p.key, since: new Date().toISOString(), baseline: p.v, auto: true };
  cfg = await api.setConfig({ focus: nf, focusHistory: hist });
  return nf;
}
function focusValue(f) {
  const since = Date.parse(f.since), m = metric(f.key);
  const after = realGames().filter((g) => Date.parse(g.startedAt) >= since), prac = games.filter((g) => g.vsCpu && Date.parse(g.startedAt) >= since);
  const t = aggSummaries(after);
  return { m, v: m.min(t) ? metricVals(t)[f.key] : null, n: after.length, prac: prac.length, pracV: prac.length ? metricVals(aggSummaries(prac))[f.key] : null, after };
}
function focusCard(compact) {
  const f = cfg.focus; if (!f) return compact ? "" : `<section class="card"><h2>Training plan</h2><div class="sub" style="margin-top:6px">Play a few games and a weekly focus will be picked from your stats.</div></section>`;
  const { m, v, n, prac, pracV, after } = focusValue(f);
  const tgt = target(m), base = f.baseline, delta = v != null && base != null ? +(v - base).toFixed(1) : null;
  const better = delta == null ? null : (m.good === "up") === delta > 0;
  const prog = v == null || base == null || tgt == null ? null : Math.max(0, Math.min(100, Math.round((100 * (m.good === "up" ? v - base : base - v)) / Math.max(0.1, Math.abs(tgt - base)))));
  const days = Math.max(0, 7 - Math.floor((Date.now() - Date.parse(f.since)) / 864e5));
  if (compact) return `<section class="card focus"><div class="card-head"><h2>This week's focus</h2><span class="sub">${f.auto ? `new focus in ${days} day${days === 1 ? "" : "s"}` : "pinned"}</span><button class="linkbtn end" data-go="progress">Training plan →</button></div>
    <div class="fx"><b>${m.name}</b><span class="fv ${tone(m, v)}">${fmt(v ?? base, m.unit)}</span><span class="sub">started at ${fmt(base, m.unit)} · target ${m.good === "up" ? "≥" : "≤"} ${tgt}${m.unit}</span></div>
    ${prog != null ? `<div class="rbar wide"><span style="width:${prog}%"></span></div>` : ""}<p class="sub" style="margin:8px 0 0">${esc(m.drill || "")}</p></section>`;
  // per day since the focus started
  const byDay = []; for (const g of after.slice().reverse()) { const d = day(g.startedAt); const l = byDay[byDay.length - 1]; if (l && l.d === d) l.g.push(g); else byDay.push({ d, g: [g] }); }
  const bars = byDay.map(({ d, g }) => ({ label: d, v: metricVals(aggSummaries(g))[f.key], n: g.length }));
  const max = Math.max(tgt || 0, ...bars.map((b) => b.v || 0), base || 0) || 1;
  return `<section class="card focus"><div class="card-head"><h2>Training plan</h2><span class="sub">one focus a week, picked from the stat furthest below its target</span></div>
    <div class="fgrid">
      <div><div class="eyebrow">THIS WEEK</div><div class="fx"><b style="font-size:20px">${m.name}</b></div><p class="sub" style="margin:4px 0 10px;line-height:1.5">${m.why}</p>
        <div class="mustats" style="margin-top:0">
          <div class="stat"><span>When this focus started</span><b>${fmt(base, m.unit)}</b><span class="sub">${day(f.since)}</span></div>
          <div class="stat"><span>Since then</span><b class="${tone(m, v)}">${fmt(v, m.unit)}</b><span class="sub">${n} game${n === 1 ? "" : "s"}${delta != null ? ` · <span class="${better ? "good" : "bad"}">${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}${m.unit}</span>` : ""}</span></div>
          <div class="stat"><span>Target</span><b>${m.good === "up" ? "≥" : "≤"} ${tgt}${m.unit}</b><span class="sub">${prog != null ? `${prog}% of the way` : "–"}</span></div>
          <div class="stat"><span>Practice vs CPU</span><b>${prac}</b><span class="sub">${prac ? `${fmt(pracV, m.unit)} in practice` : "games in training mode count here"}</span></div></div></div>
      <div><div class="eyebrow">DRILL · 10 MINUTES</div><p style="margin:6px 0 12px;line-height:1.55">${esc(m.drill || "")}</p>
        <div class="eyebrow">DURING GAMES</div><p class="sub" style="margin:6px 0 12px;line-height:1.55">${cfg.focusVoice !== false ? `At the start of each game you'll hear "Focus: ${esc(m.name.toLowerCase())}".` : "Game-start reminder is off."}${f.key === "lc" || f.key === "tech" ? " The miss sounds you already have are your live feedback for this one." : ""}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <label class="oppsel"><span class="sub">Focus</span><select data-focus>${METRICS.map((x) => `<option value="${x.key}" ${x.key === f.key ? "selected" : ""}>${x.name}</option>`).join("")}</select></label>
          ${f.auto ? "" : `<button class="btn" data-focusauto="1">Let the app pick weekly</button>`}
          <label class="switch" style="font-size:12.5px"><input type="checkbox" data-focusvoice ${cfg.focusVoice !== false ? "checked" : ""}> Game-start reminder</label></div></div>
    </div>
    ${bars.length ? `<div class="eyebrow" style="margin-top:16px">DAY BY DAY</div><div class="fbars">${bars.map((b) => `<div class="fbar"><div class="col"><i style="height:${b.v == null ? 0 : Math.max(3, (100 * b.v) / max)}%;background:${toneColor[tone(m, b.v)]}"></i>
      ${tgt != null ? `<span class="tl" style="bottom:${(100 * tgt) / max}%"></span>` : ""}</div><b>${fmt(b.v, m.unit)}</b><span class="sub">${esc(b.label.replace(/^\w+, /, ""))}</span></div>`).join("")}</div>` : ""}
    ${(cfg.focusHistory || []).length ? `<div class="eyebrow" style="margin-top:16px">PAST WEEKS</div><div class="wlist">${cfg.focusHistory.slice().reverse().map((h) => { const hm = metric(h.key); const d = h.end != null && h.baseline != null ? +(h.end - h.baseline).toFixed(1) : null; const ok = d == null ? null : (hm.good === "up") === d > 0;
      return `<div class="wrow static"><span class="tag ${ok ? "good" : ""}">${day(h.since).replace(/^\w+, /, "")}</span><span style="flex:1"><b>${hm.name}</b><span class="sub">${fmt(h.baseline, hm.unit)} → ${fmt(h.end, hm.unit)}${d != null ? ` (${d > 0 ? "+" : ""}${d}${hm.unit})` : ""}</span></span></div>`; }).join("")}</div>` : ""}
  </section>`;
}

function renderProgress() {
  const ss = sessions(games);
  if (!ss.length) return `<div class="page"><div class="card empty">No games yet.</div></div>`;
  const m = metric(ui.progMetric);
  const rows = ss.slice().reverse().map((s) => { const t = aggSummaries(s.games); const v = metricVals(t); const r = record(s.games.filter((g) => g.complete !== false)); return { s, v, r }; });
  const chart = ss.slice(-24).map((s) => ({ s, v: metricVals(aggSummaries(s.games))[m.key] }));
  return `<div class="page">${liveStrip()}
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><h1 style="margin:0;font-size:22px">Training & progress</h1>
      <span class="sub">${games.length} games · ${ss.length} sessions</span>
      <div class="seg" style="margin-left:auto;flex-wrap:wrap">${METRICS.map((x) => `<button class="${x.key === m.key ? "on" : ""}" data-prog="${x.key}">${x.name}</button>`).join("")}</div></div>
    ${focusCard(false)}
    <section class="card"><div class="card-head"><h2>${m.name}</h2><span class="sub">last ${chart.length} sessions</span></div>${progressBars(chart, m)}</section>
    <section class="card"><h2>Sessions</h2><div class="tablewrap"><table style="margin-top:10px"><tr><th>Session</th><th>Games</th><th>Record</th>
      ${["lc", "tech", "opk", "dpo", "gent", "knee"].map((k) => `<th>${metric(k).name}</th>`).join("")}</tr>
      ${rows.map(({ s, v, r }) => `<tr><td>${day(s.start)} <span class="sub">${clock(s.start)}</span></td><td>${s.games.length}</td><td>${r.w}–${r.l}</td>
        ${["lc", "tech", "opk", "dpo", "gent", "knee"].map((k) => `<td class="${tone(metric(k), v[k])}">${fmt(v[k], metric(k).unit)}</td>`).join("")}</tr>`).join("")}</table></div></section>
  </div>`;
}

// ------------------------------------------------------------------ SETTINGS
function renderSettings() {
  const sw = (key, label, val) => `<label class="switch"><input type="checkbox" data-set="${key}" ${val ? "checked" : ""}> ${label}</label>`;
  return `<div class="page"><h1 style="margin:0;font-size:22px">Settings</h1>
    <section class="card"><h2>You</h2><div class="set" style="margin-top:14px">
      <label class="k" for="cc">Connect code</label><div><input id="cc" type="text" data-set="connectCode" value="${esc(cfg.connectCode)}" placeholder="ABCD#123"><div class="h">How the coach finds you in online games.</div></div>
      <label class="k" for="mp">Your port in local games</label><div><select id="mp" data-set="myPort"><option value="">Automatic (only Falcon, else port 1)</option>${[1, 2, 3, 4].map((p) => `<option value="${p}" ${cfg.myPort === p ? "selected" : ""}>Port ${p}</option>`).join("")}</select></div>
    </div></section>
    <section class="card"><h2>Sounds during matches</h2><div class="set" style="margin-top:14px">
      <span class="k">Cues</span><div style="display:flex;flex-direction:column;gap:10px">
        ${sw("callouts.lcancel", "Low buzz on a missed L-cancel", cfg.callouts?.lcancel)}
        ${sw("callouts.missedTech", "Two-note sound on a missed tech", cfg.callouts?.missedTech)}
        ${sw("lcancelSuccessTick", "Tiny tick on a successful L-cancel", cfg.lcancelSuccessTick)}
        ${sw("voice", "Say “Coach connected” when the game is found", cfg.voice)}</div>
      <label class="k" for="vol">Cue volume</label><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><input id="vol" type="range" min="0" max="1" step="0.05" data-set="cueVolume" value="${cfg.cueVolume}">
        <button class="btn" data-test="lcancel_miss">Test buzz</button><button class="btn" data-test="tech_miss">Test tech sound</button></div>
    </div></section>
    <section class="card"><h2>App</h2><div class="set" style="margin-top:14px">
      <label class="k" for="theme">Look</label><div><select id="theme" data-set="theme">
        <option value="melee" ${(cfg.theme || "melee") === "melee" ? "selected" : ""}>Melee: blue menus, HUD numbers</option>
        <option value="classic" ${cfg.theme === "classic" ? "selected" : ""}>Classic: plain dark</option></select></div>
      <label class="k" for="sc">Interface scale</label><div style="display:flex;gap:12px;align-items:center"><input id="sc" type="range" min="0.7" max="1.6" step="0.1" data-set="uiScale" value="${cfg.uiScale}">
        <b>${Math.round(cfg.uiScale * 100)}%</b><span class="h">Ctrl + / Ctrl − / Ctrl 0</span></div>
      <span class="k">Window</span><div style="display:flex;flex-direction:column;gap:10px">
        ${sw("closeToTray", "Closing the window keeps the coach running in the tray", cfg.closeToTray)}
        ${sw("startWithWindows", "Start with Windows (in the tray)", cfg.startWithWindows)}</div>
    </div></section>
    <section class="card"><h2>Replays</h2><div class="sub" style="margin:4px 0 12px">New replays in these folders are added automatically.</div>
      ${(cfg.importFolders || []).map((f, i) => `<div class="folder"><span title="${esc(f)}">${esc(f)}</span><button class="linkbtn" data-rmfolder="${i}" style="color:var(--red)">Remove</button></div>`).join("")}
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><button class="btn" data-act="addfolder">Add folder…</button><button class="btn primary" data-act="import">Import now</button></div></section>
    <section class="card"><h2>Rivals of Aether II</h2><div class="set" style="margin-top:14px">
      <span class="k">Game data</span><div>${r2 ? (r2.available ? `<span class="good">● Found</span> <span class="sub">· tag ${esc(r2.tag || "–")} · ${r2.games.length} games</span>` : `<span class="bad">● Not found</span> <span class="sub">· looked in ${esc(r2.root)}</span>`) : '<span class="sub">Switch to Rivals 2 at the top to load it.</span>'}</div>
      <span class="k">Characters you play</span><div class="sub">${r2?.myChars?.length ? r2.myChars.slice(0, 6).map((k) => esc(r2charName(k).name)).join(", ") : "–"}<div class="h">Used to tell which player is you in each replay. Comes from your playtime per character.</div></div>
    </div></section>
    <section class="card"><h2>Updates</h2><div class="set" style="margin-top:14px">
      <label class="k" for="urepo">GitHub repository</label><div><input id="urepo" type="text" data-set="updateRepo" value="${esc(cfg.updateRepo || "")}" placeholder="owner/melee-coach" style="width:260px">
        <div class="h">Melee Coach checks this repository's releases every few hours and installs app updates by itself (you'll still see the restart pop-up). Leave empty to turn it off.</div></div>
      <span class="k">Status</span><div id="updStatus" class="sub">${cfg.updateRepo ? "–" : "Off"}</div></div>
      <div style="margin-top:12px"><button class="btn" data-act="checkUpdate" ${cfg.updateRepo ? "" : "disabled"}>Check now</button></div></section>
    <section class="card"><h2>OBS (Rivals 2 clips)</h2><div class="sub" style="margin:4px 0 12px">After each Rivals 2 game, Melee Coach asks OBS to save its replay buffer and attaches the video to that game. In OBS: turn on Tools → WebSocket Server Settings → Enable WebSocket server, and set Settings → Output → Replay Buffer to the length you want (e.g. 300 s for whole games).</div>
      <div class="set">
        <span class="k">Use OBS</span><div><label class="switch"><input type="checkbox" data-obs="enabled" ${cfg.obs?.enabled ? "checked" : ""}> Save a clip after every Rivals 2 game</label></div>
        <label class="k" for="obsh">Address</label><div><input id="obsh" type="text" data-obs="host" value="${esc(cfg.obs?.host || "127.0.0.1")}" style="width:160px"> <span class="sub">port</span> <input type="number" data-obs="port" value="${cfg.obs?.port || 4455}" style="width:90px"></div>
        <label class="k" for="obsp">Password</label><div><input id="obsp" type="password" data-obs="password" value="${esc(cfg.obs?.password || "")}" placeholder="from OBS's WebSocket settings" style="width:260px"></div>
        <span class="k">Status</span><div id="obsStatus" class="sub">–</div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px"><button class="btn" data-act="obsTest">Test connection</button></div></section>
    <section class="card"><h2>Clips</h2><div class="sub" style="margin:4px 0 12px">Clips and match videos are made with Slippi's playback Dolphin and your own Melee ISO. Click any event in Review to make its clip on the spot (about 10 seconds, ~3 MB), or record a whole match (30–60 MB). Everything stays on this PC.</div>
      <div class="set">
        <span class="k">Status</span><div id="clipCheck" class="sub">Checking…</div>
        <span class="k">Fast recording</span><div>${sw("clipsFast", "Record faster than real time when your PC can (each recording is checked, and redone at normal speed if it doesn't come out right)", cfg.clipsFast !== false)}</div>
        <span class="k">Prepare clips</span><div>${sw("clipsPrep", "Clips of highlights and costly mistakes from your last 10 games, made while you take a break", cfg.clipsPrep !== false)}</div>
        <span class="k">Record full matches</span><div>${sw("clipsAuto", "Also record your last 5 games in full while you take a break (about as long as each match)", cfg.clipsAuto)}</div>
        <label class="k" for="cim">Break length</label><div><input id="cim" type="number" min="1" max="60" data-set="clipsIdleMin" value="${cfg.clipsIdleMin ?? 5}"> <span class="sub">minutes with no new game (recording stops the moment a game starts)</span></div>
        <label class="k" for="ckd">Delete clips older than</label><div><input id="ckd" type="number" min="0" data-set="clipsKeepDays" value="${cfg.clipsKeepDays}"> <span class="sub">days (0 = keep forever)</span></div>
        <label class="k" for="iso">Melee ISO</label><div><input id="iso" type="text" data-set="isoPath" value="${esc(cfg.isoPath)}" placeholder="Using Slippi Launcher's ISO setting" style="width:min(100%,460px)"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn" data-act="openClips">Open clips folder</button><button class="btn" data-act="clipCheck">Check again</button></div></section>
    <section class="card"><h2>Targets</h2><div class="sub" style="margin:4px 0 12px">What counts as “good” on the dashboard. Raise them as you improve.</div>
      <div class="set">${METRICS.map((m) => `<label class="k" for="t-${m.key}">${m.name} <span class="sub">(${m.good === "up" ? "at least" : "at most"})</span></label>
        <div><input id="t-${m.key}" type="number" data-target="${m.key}" value="${target(m)}"> <span class="sub">${m.unit}</span></div>`).join("")}</div></section>
  </div>`;
}

// ------------------------------------------------------------------ events
// ------------------------------------------------------------------ resizable side lists
const PANES = [[".games-layout:not(.rv-layout) > .glist", "games", 300], [".rv-layout > .glist", "review", 300], [".review > .mulist", "matchups", 240]];
function addSplitters(el) {
  for (const [sel, key, def] of PANES) {
    const pane = $(sel, el); if (!pane || pane.nextElementSibling?.classList.contains("splitter")) continue;
    const w0 = (cfg.panes || {})[key]; if (w0) pane.style.cssText += `;flex:0 0 ${w0}px;width:${w0}px`;
    const sp = document.createElement("div"); sp.className = "splitter"; sp.tabIndex = 0;
    sp.setAttribute("role", "separator"); sp.setAttribute("aria-orientation", "vertical"); sp.setAttribute("aria-label", `Resize the ${key} list`);
    sp.title = "Drag to resize (double-click to reset)"; pane.after(sp);
    const set = (w, save) => { w = Math.max(180, Math.min(640, Math.round(w))); pane.style.flex = `0 0 ${w}px`; pane.style.width = w + "px";
      if (save) api.setConfig({ panes: { ...(cfg.panes || {}), [key]: w } }).then((c) => (cfg = c)); return w; };
    sp.onpointerdown = (e) => { e.preventDefault(); try { sp.setPointerCapture(e.pointerId); } catch {} sp.classList.add("drag"); const x0 = e.clientX, w0 = pane.getBoundingClientRect().width; let w = w0;
      sp.onpointermove = (m) => { w = set(w0 + m.clientX - x0); };
      sp.onpointerup = () => { sp.onpointermove = sp.onpointerup = null; sp.classList.remove("drag"); set(w, true); }; };
    sp.ondblclick = () => set(def, true);
    sp.onkeydown = (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); set(pane.getBoundingClientRect().width + (e.key === "ArrowRight" ? 20 : -20), true); } };
  }
}
function bind(el) {
  addSplitters(el);
  $$("[data-go]", el).forEach((b) => b.onclick = () => go(b.dataset.go));
  $$("[data-game]", el).forEach((b) => b.onclick = () => go("games", { gameId: b.dataset.game, stock: "all", metric: null }));
  $$("[data-moment]", el).forEach((b) => b.onclick = () => { const [gid] = b.dataset.moment.split("|"); const g = games.find((x) => x.id === gid);
    const s = sessions(games).find((s) => s.games.some((x) => x.id === gid)); const [, f, type] = b.dataset.moment.split("|");
    go("review", { session: s?.start, rGame: gid, rEvent: `${type}|${f}` }); });
  $$("[data-rgame]", el).forEach((b) => b.onclick = () => { ui.rGame = b.dataset.rgame; if (b.dataset.rsess) ui.session = b.dataset.rsess; ui.rEvent = null;
    const y = $(".glist .rows", el)?.scrollTop; ui._rScrolled = true; render(); const n = $(".glist .rows"); if (n && y != null) n.scrollTop = y; });
  $$("[data-rmon]", el).forEach((b) => b.onclick = () => { const m = b.dataset.rmon; ui.rmonOpen ||= new Set();
    if (ui.rmonOpen.has(m)) { ui.rmonOpen.delete(m); ui._rCloseMon = m; } else { ui.rmonOpen.add(m); if (ui._rCloseMon === m) ui._rCloseMon = null; }
    const y = $(".glist .rows", el)?.scrollTop; render(); const n = $(".glist .rows"); if (n && y != null) n.scrollTop = y; });
  $$("[data-gstep]", el).forEach((b) => b.onclick = () => { const s = sessions(byOpp(games)).find((x) => x.start === ui.session); const gs = (s?.games || []).slice().sort((a, c) => Date.parse(a.startedAt) - Date.parse(c.startedAt));
    const i = gs.findIndex((x) => x.id === ui.rGame) + +b.dataset.gstep; if (gs[i]) { ui.rGame = gs[i].id; ui.rEvent = null; render(); } });
  $$("[data-ev]", el).forEach((b) => b.onclick = () => { if (player && player.gid === ui.rGame) player.select(b.dataset.ev); else { ui.rEvent = b.dataset.ev; $$(".evrow").forEach((r) => r.classList.toggle("sel", r.dataset.ev === ui.rEvent)); renderEvDetail(); loadMatch(); } });
  $$("[data-gmon]", el).forEach((b) => b.onclick = () => { const m = b.dataset.gmon; ui.gmonOpen ||= new Set();
    if (ui.gmonOpen.has(m)) { ui.gmonOpen.delete(m); ui._closeSelMon = m; } else { ui.gmonOpen.add(m); if (ui._closeSelMon === m) ui._closeSelMon = null; }
    const y = $(".glist .rows")?.scrollTop; render(); setTimeout(() => { const r = $(".glist .rows"); if (r && y != null) r.scrollTop = y; }); });
  $$("[data-gday]", el).forEach((b) => b.onclick = () => { const d = b.dataset.gday; ui.gdayOpen ||= new Set();
    if (ui.gdayOpen.has(d)) { ui.gdayOpen.delete(d); ui._closeSel = d; } else { ui.gdayOpen.add(d); if (ui._closeSel === d) ui._closeSel = null; }
    const y = $(".glist .rows")?.scrollTop; render(); setTimeout(() => { const r = $(".glist .rows"); if (r && y != null) r.scrollTop = y; }); });
  $$("[data-focus]", el).forEach((sel) => sel.onchange = async () => { const m = metric(sel.value), v = metricVals(aggSummaries(realGames().slice(0, 30)))[sel.value];
    cfg = await api.setConfig({ focus: { key: sel.value, since: new Date().toISOString(), baseline: v, auto: false } }); render(); });
  $$("[data-focusauto]", el).forEach((b) => b.onclick = async () => { cfg = await api.setConfig({ focus: { ...cfg.focus, auto: true, since: new Date(Date.now() - 8 * 864e5).toISOString() } }); await ensureFocus(); render(); });
  $$("[data-focusvoice]", el).forEach((c) => c.onchange = async () => { cfg = await api.setConfig({ focusVoice: c.checked }); render(); });
  $$("[data-mumode]", el).forEach((b) => b.onclick = () => { ui.muMode = b.dataset.mumode; render(); });
  $$("[data-player]", el).forEach((b) => b.onclick = () => { ui.player = b.dataset.player; render(); });
  $$("[data-pnote]", el).forEach((t) => { let tm = null; t.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { cfg = await api.setConfig({ playerNotes: { ...(cfg.playerNotes || {}), [t.dataset.pnote]: t.value } }); }, 600); }; });
  $$("[data-recapreview]", el).forEach((b) => b.onclick = () => { ui.opp = null; const s = sessions(games).find((x) => x.games.some((g) => Date.parse(g.startedAt) >= Date.parse(b.dataset.recapreview))); go("review", { session: s?.start, rGame: null, rEvent: null }); });
  $$("[data-obs]", el).forEach((i) => i.onchange = async () => { const k = i.dataset.obs; const v = i.type === "checkbox" ? i.checked : k === "port" ? +i.value : i.value;
    cfg = await api.setConfig({ obs: { ...(cfg.obs || {}), [k]: v } }); });
  $$("[data-act=checkUpdate]", el).forEach((b) => b.onclick = async () => { const o = $("#updStatus"); o.textContent = "Checking…"; const r = await api.checkUpdate();
    o.textContent = r.state === "current" ? `Up to date (v${r.version})` : r.state === "applied" ? `v${r.version} installed.`  : r.state === "installer" ? `v${r.version} needs the full installer` : r.state === "error" ? `Couldn't check: ${r.error}` : "Off"; });
  $$("[data-act=checkUpdate]", el).forEach((b) => { const orig = b.onclick; b.onclick = async () => { await orig(); const o = $("#updStatus");
    if (/installed/.test(o.textContent)) { o.insertAdjacentHTML("beforeend", ' <button class="btn primary" data-act="restartNow">Restart now</button>'); $("[data-act=restartNow]", o).onclick = () => api.restartApp(); } }; });
  $$("[data-act=obsTest]", el).forEach((b) => b.onclick = async () => { const o = $("#obsStatus"); o.textContent = "Connecting…"; const r = await api.obsStatus();
    o.innerHTML = r.ok ? `<span class="good">● Connected</span> · OBS ${esc(r.version)} · replay buffer ${r.replayBuffer ? "running" : "<span class='bad'>off</span> (it's started automatically on the first save)"}` : `<span class="bad">● ${esc(r.error)}</span>`; });
  $$("[data-act=obsSave]", el).forEach((b) => b.onclick = async () => { b.disabled = true; b.textContent = "Saving…"; const r = await api.obsSaveNow(); b.textContent = r.ok ? "Saved" : "Save clip now"; b.disabled = false; if (!r.ok) alertBar(r.error); r2Refresh(); });
  $$("[data-clipfile]", el).forEach((b) => b.onclick = async () => { const url = await api.clipUrl(b.dataset.clipfile); if (!url) return alertBar("That clip file isn't there anymore."); showVideo(url, b.dataset.title || "Clip"); });
  $$("[data-hlk]", el).forEach((b) => b.onclick = () => { ui.hlKind = b.dataset.hlk; render(); });
  $$("[data-hlgame]", el).forEach((b) => b.onclick = () => { const gid = b.dataset.hlgame; const s = sessions(games).find((x) => x.games.some((y) => y.id === gid)); ui.opp = null; go("review", { session: s?.start, rGame: gid, rEvent: null }); });
  $$("[data-opp]", el).forEach((sel) => sel.onchange = () => { ui.opp = sel.value || null; ui.session = null; ui.rGame = null; ui.rEvent = null; ui.gameId = null; render(); });
  $$("[data-mu]", el).forEach((b) => b.onclick = () => { go("matchups", { mu: b.dataset.mu }); });
  $$("[data-hl]", el).forEach((b) => b.onclick = () => { const [gid, f] = b.dataset.hl.split("|"); const s = sessions(byOpp(games)).find((x) => x.games.some((y) => y.id === gid));
    go("review", { session: s?.start, rGame: gid, rEvent: `good|${f}` }); });
  $$("[data-evt]", el).forEach((b) => b.onclick = () => { ui.evOn[b.dataset.evt] = !ui.evOn[b.dataset.evt]; render(); });
  $$("[data-sess]", el).forEach((b) => b.onclick = () => { ui.session = b.dataset.sess; ui.rGame = null; ui.rEvent = null; const y = $(".snav", el)?.scrollTop; render(); const n = $(".snav"); if (n && y) n.scrollTop = y; });
  $$("[data-month]", el).forEach((d) => d.ontoggle = () => { (ui.openMonths ||= {})[d.dataset.month] = d.open; });
  $$("[data-prog]", el).forEach((b) => b.onclick = () => { ui.progMetric = b.dataset.prog; render(); });
  $$("[data-stock]", el).forEach((b) => b.onclick = () => { ui.stock = b.dataset.stock === "all" ? "all" : +b.dataset.stock; render(); });
  $$("[data-tab]", el).forEach((b) => b.onclick = () => { ui.tab = b.dataset.tab; ui.metric = null; render(); });
  $$("[data-metric]", el).forEach((b) => b.onclick = () => { ui.metric = b.dataset.metric; render(); });
  $$("details", el).forEach((d) => d.ontoggle = () => { ui.open[d.dataset.k] = d.open; });
  $$("[data-replay]", el).forEach((b) => b.onclick = () => api.openReplay(b.dataset.replay));
  $$("[data-act=import]", el).forEach((b) => b.onclick = () => api.import());
  $$("[data-act=recordSession]", el).forEach((b) => b.onclick = async () => {
    const sess = sessions(games).find((s) => s.start === ui.session); if (!sess) return;
    const todo = [];
    for (const g of sess.games) if (!(await api.clipInfo({ gameId: g.id, frame: "full" })).has) todo.push(g);
    for (const g of todo) { clipState[`${g.id}_full`] ||= { state: "queued" }; api.renderClip({ gameId: g.id, frame: "full" }).then((r) => { if (!r.ok) clipState[`${g.id}_full`] = { state: "error", error: r.error }; }); }
    b.textContent = todo.length ? `Recording ${todo.length} match${todo.length === 1 ? "" : "es"}…` : "All matches recorded"; b.disabled = true; loadMatch();
  });
  $$("[data-act=openClips]", el).forEach((b) => b.onclick = () => api.openClips());
  $$("[data-act=clipCheck]", el).forEach((b) => b.onclick = () => renderClipCheck());
  if (view === "home") loadHeroArt();
  $$("[data-hlgo]", el).forEach((b) => b.onclick = () => { const [gid, f] = b.dataset.hlgo.split("|"); const sess = sessions(games).find((x) => x.games.some((y) => y.id === gid));
    go("review", { session: sess?.start, rGame: gid, rEvent: `good|${f}` }); });
  if (view === "review") { loadMatch(); markRecorded(); if (!ui._rScrolled) $(".rv-layout .grow.sel", el)?.scrollIntoView({ block: "center" }); ui._rScrolled = false; }
  if (view === "settings") renderClipCheck();
  $$("[data-act=addfolder]", el).forEach((b) => b.onclick = async () => { const f = await api.pickFolder(); if (f) { cfg = await api.setConfig({ importFolders: [...cfg.importFolders, f] }); render(); api.import({ folders: [f], sinceDays: 0 }); } });
  $$("[data-rmfolder]", el).forEach((b) => b.onclick = async () => { const l = [...cfg.importFolders]; l.splice(+b.dataset.rmfolder, 1); cfg = await api.setConfig({ importFolders: l }); render(); });
  $$("[data-test]", el).forEach((b) => b.onclick = () => playCue(b.dataset.test));
  $$("[data-target]", el).forEach((i) => i.onchange = async () => { cfg = await api.setConfig({ targets: { [i.dataset.target]: +i.value } }); });
  $$("[data-set]", el).forEach((i) => {
    const ev = i.type === "range" ? "input" : "change";
    i.addEventListener(ev, async () => {
      const k = i.dataset.set; let v = i.type === "checkbox" ? i.checked : i.type === "range" ? +i.value : i.value;
      if (k === "myPort") v = v ? +v : null;
      if (k === "clipsPerGame" || k === "clipsKeepDays" || k === "clipsIdleMin") v = +v;
      const patch = k.startsWith("callouts.") ? { callouts: { [k.split(".")[1]]: v } } : { [k]: v };
      cfg = await api.setConfig(patch);
      if (k === "theme") applyGame();
      if (k === "uiScale") { const b = i.parentElement.querySelector("b"); if (b) b.textContent = Math.round(v * 100) + "%"; }
    });
  });
}

// ------------------------------------------------------------------ audio (Web Audio, low latency)
let actx = null;
function playCue(name) {
  try {
    actx ||= new AudioContext();
    const segs = { lcancel_miss: [[170, 0.09]], lcancel_hit: [[1200, 0.025]], tech_miss: [[520, 0.07], [0, 0.025], [350, 0.11]] }[name];
    if (!segs) return;
    let t = actx.currentTime + 0.005; const vol = (cfg.cueVolume ?? 0.6) * 0.5;
    for (const [f, d] of segs) {
      if (f) { const o = actx.createOscillator(), g = actx.createGain(); o.type = "square"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.setValueAtTime(vol, t + d - 0.006); g.gain.linearRampToValueAtTime(0, t + d);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + 0.01); }
      t += d;
    }
  } catch {}
}
function say(text) { try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.15; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} }

// ------------------------------------------------------------------ live events
api.on("cue", playCue);
// ---------- live update notice
let liveGame = false;
let toastTimer = null;
function showUpdate(u) {
  const t = $("#updToast"); clearTimeout(toastTimer);
  if (!u) { t.hidden = true; return; }
  t.hidden = false; t.className = "toast " + u.state;
  const act = $(".toast-act", t); act.hidden = u.state !== "ready";
  const notes = (u.notes || []).slice(0, 5);
  $("#updNotes").innerHTML = u.state === "applying" ? "" : notes.map((n) => `<li>${esc(n)}</li>`).join("");
  if (u.state === "applying") { $("#updTitle").textContent = "Installing update…"; $("#updBody").textContent = "New files are arriving. This only takes a moment."; }
  else if (u.state === "ready") {
    $("#updTitle").textContent = `Update ready · v${u.version}`;
    $("#updBody").textContent = liveGame ? "Finish your game first. Restarting takes about a second." : "Restart to start using it. Takes about a second.";
    $("#updRestart").disabled = liveGame;
  } else if (u.state === "done") {
    $("#updTitle").textContent = `Updated to v${u.to}`; $("#updBody").textContent = notes.length ? "What's new:" : "You're on the latest version.";
    toastTimer = setTimeout(() => { t.hidden = true; }, 9000);
  }
}
api.on("update", showUpdate);
$("#updRestart").onclick = () => api.restartApp();
$("#updLater").onclick = () => { $("#updToast").hidden = true; };
$("#updClose").onclick = () => { $("#updToast").hidden = true; };
api.on("gameStart", () => { liveGame = true;
  if (cfg.focus && cfg.focusVoice !== false && cfg.game !== "rivals") setTimeout(() => say(`Focus: ${metric(cfg.focus.key).name.toLowerCase()}`), 1200); });
api.on("gameEnd", () => { liveGame = false; api.pendingUpdate().then((u) => u && showUpdate({ state: "ready", ...u })); });
api.pendingUpdate().then((u) => u && showUpdate({ state: "ready", ...u }));
api.justUpdated().then((u) => { $(".ver") && ($(".ver").textContent = "v" + u.to); if (u.from) showUpdate({ state: "done", ...u }); });
api.on("clip", (ev) => {
  if (ev.type === "fastOff") return; // the renderer already fell back to normal speed
  if (ev.type === "ffmpeg") { const box = $("#sbImport"); box.hidden = false; $("#sbImportText").textContent = ev.state === "downloading" ? "Downloading video tools (one time, ~30 MB)" : "Recording matches"; $("#sbCount").textContent = ""; return; }
  const prev = clipState[ev.key];
  if (ev.type === "queued") clipState[ev.key] ||= { state: "queued" };
  else if (ev.type === "start") clipState[ev.key] = { state: "rendering", pct: 0 };
  else if (ev.type === "progress") clipState[ev.key] = { state: ev.stage === "encoding" ? "encoding" : "rendering", pct: ev.pct };
  else if (ev.type === "paused") clipState[ev.key] = { state: "paused" };
  else if (ev.type === "done") delete clipState[ev.key];
  else if (ev.type === "error") clipState[ev.key] = { state: "error", error: ev.error };
  // status bar
  const box = $("#sbImport"), cs = clipState[ev.key];
  if (cs && cs.state !== "error") { box.hidden = false; box.classList.remove("fade");
    $("#sbImportText").textContent = cs.state === "paused" ? "Recording paused while you play" : cs.state === "encoding" ? "Saving match video" : "Recording match";
    $("#sbFill").style.width = `${cs.state === "encoding" ? 100 : cs.pct || 0}%`;
    $("#sbCount").textContent = ev.pending ? `${ev.pending} more queued` : cs.pct != null && cs.state === "rendering" ? `${cs.pct}%` : ""; }
  if ((ev.type === "done" || ev.type === "error") && !ev.pending) { $("#sbImportText").textContent = ev.type === "done" ? "Match recorded" : "Recording failed"; $("#sbCount").textContent = ""; $("#sbFill").style.width = "100%"; setTimeout(() => { box.hidden = true; }, 3000); }
  // refresh the review panel when the clip it's waiting for changes (never interrupt a playing video)
  const box2 = $("#clipBox");
  if (view === "review" && box2) {
    const gid = box2.dataset.gid, g = cache.get(gid);
    const sel = g && ui.rEvent ? gameEvents(g).find((e) => evKey(e) === ui.rEvent) : null;
    const waitingFor = [`${gid}_full`, sel ? `${gid}_${sel.frame}` : null];
    if (waitingFor.includes(ev.key) && !(player && (player.key === ev.key || player.key === `${gid}_full`))) {
      if (ev.type === "progress" && prev?.state === cs?.state) { const bar = $(".rbar span", box2), t = $(".viewer-ph div div div", box2); if (bar) bar.style.width = (cs.state === "encoding" ? 100 : cs.pct) + "%"; if (t && cs.state === "rendering") t.textContent = t.textContent.replace(/\d+%$/, cs.pct + "%"); }
      else loadMatch();
    }
  }
  if (ev.type === "done" && view === "review") markRecorded();
});
api.on("say", say);
api.on("config", (c) => { cfg = c; });
api.on("status", (s) => { setTimeout(updateStatusBar); const changed = s.connected !== status.connected || s.inGame !== status.inGame; status = s; if (!s.inGame) liveSnap = null; if (changed && view !== "games") render(); else if (changed) updateLive(); });
api.on("live", (snap) => { const first = !liveSnap; liveSnap = snap; if (first && view !== "games") render(); else updateLive(); });
api.on("gameEnd", async () => { liveSnap = null; cache.clear(); await refresh(); });
api.on("games", async () => { cache.clear(); await refresh(); });
// Status bar: connection on the left, import progress in the middle, game count on the right.
// Only text and widths change, so nothing flashes while numbers update.
let sbFadeTimer = null;
api.on("import", (p) => {
  const box = $("#sbImport"), fill = $("#sbFill"), count = $("#sbCount"), text = $("#sbImportText");
  clearTimeout(sbFadeTimer);
  if (p.done === true) {
    text.textContent = p.label || (p.added ? `Imported ${p.added} new game${p.added > 1 ? "s" : ""}` : "Replays up to date");
    fill.style.width = "100%"; count.textContent = "";
    sbFadeTimer = setTimeout(() => { box.classList.add("fade"); sbFadeTimer = setTimeout(() => { box.hidden = true; box.classList.remove("fade"); }, 400); }, 2500);
    return;
  }
  if (!p.total) return;
  box.hidden = false; box.classList.remove("fade");
  text.textContent = p.label || "Importing replays";
  fill.style.width = `${Math.round((100 * p.done) / p.total)}%`;
  count.textContent = `${p.done.toLocaleString()} / ${p.total.toLocaleString()}`;
});
function updateStatusBar() {
  const c = $("#sbConn"); c.classList.toggle("on", !!status.connected);
  $("#sbConnText").textContent = status.connected ? (status.inGame ? "Live — coaching this game" : "Connected to Melee") : "Waiting for game";
  $("#sbGames").textContent = games.length ? `${games.length.toLocaleString()} games` : "";
  if (cfg.game === "rivals") applyGame();
}
function updateLive() { const el = $(".live"); if (el && liveSnap) el.outerHTML = liveStrip(); else if (!el && liveSnap && view !== "games") render(); }

(async () => { cfg = await api.config(); status = await api.status(); if (cfg.game === "rivals") r2 = await api.r2Data(); await refresh(); if (await ensureFocus()) render(); })();
api.on("r2", () => r2Refresh());
api.on("obs", (r) => { if (!r.ok) alertBar("OBS clip: " + r.error); });
function alertBar(msg) { const box = $("#sbImport"); box.hidden = false; $("#sbImportText").textContent = msg; $("#sbCount").textContent = ""; $("#sbFill").style.width = "0"; setTimeout(() => { box.hidden = true; }, 6000); }
function showVideo(url, title) {
  const m = document.createElement("div"); m.className = "vmodal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", title);
  m.innerHTML = `<div class="vbox"><div class="card-head"><b>${esc(title)}</b><button class="toast-x end" aria-label="Close">×</button></div><video src="${url}" controls autoplay></video></div>`;
  const close = () => { m.remove(); document.removeEventListener("keydown", onKey); }; const onKey = (e) => { if (e.key === "Escape") close(); };
  m.onclick = (e) => { if (e.target === m) close(); }; $(".toast-x", m).onclick = close; document.addEventListener("keydown", onKey); document.body.appendChild(m);
}
api.on("recap", () => { if (view === "home") render(); });
api.on("goto", (p) => { if (p?.view) go(p.view); });
$$(".gswitch button").forEach((b) => b.onclick = async () => {
  if ((cfg.game || "melee") === b.dataset.game) return;
  cfg = await api.setConfig({ game: b.dataset.game });
  if (cfg.game === "rivals" && !r2) r2 = await api.r2Data();
  $$(".rail button").forEach((x) => x.classList.toggle("on", x.dataset.view === view)); render(); $("#content").scrollTop = 0;
});
