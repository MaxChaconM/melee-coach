// Rivals of Aether II screens (light mode): history from replay headers, results and per-game
// numbers from the game's own stats save, and per-character totals.
let r2 = null;
const R2COL = { Zetterburn: "#e8643a", Forsburn: "#8a8f6a", Etalus: "#9fd3f0", Olympia: "#e58fc4", "La Reina": "#e6c04a", Loxodont: "#7aa36b",
  Galvan: "#6fb7d8", Clairen: "#d6556e", Wrastor: "#7ec7e8", Kragg: "#a8865a", Ranno: "#5fc28a", Orcane: "#5b8def", Maypul: "#6cc26a",
  Absa: "#b9a7e8", Fleet: "#f2c76a", "Captain Falcon": "#e85d3a", Fox: "#d8a24a", Marth: "#6c74d9", Sheik: "#8aa6c8", Ganondorf: "#8a6aa8",
  Wolf: "#9aa0b4", "Zero Suit Samus": "#5ea0e8" };
const r2chip = (c, size = 30) => `<span class="chip" style="width:${size}px;height:${size}px;background:${R2COL[c?.name] || "#8b8d96"}">${esc(initials(c?.name || "?"))}</span>`;
const r2name = (c) => `${esc(c?.name || "?")}${c?.mod ? ' <span class="wsb" title="Steam Workshop character">WS</span>' : ""}`;
const secs = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const r2sum = (x) => (x ? (x.ONLINE || 0) + (x.LOCAL || 0) : 0);
function r2charName(key) {
  const m = /^(\d+)_Char_(\w+)$/.exec(key);
  const code = m ? m[2] : key; const mod = !!m;
  const BASE = { Zet: "Zetterburn", For: "Forsburn", Eta: "Etalus", Oly: "Olympia", Lar: "La Reina", Lox: "Loxodont", Gal: "Galvan", Cla: "Clairen",
    Wra: "Wrastor", Kra: "Kragg", Ran: "Ranno", Orc: "Orcane", May: "Maypul", Abs: "Absa", Fle: "Fleet" };
  const MODS = { Cap: "Captain Falcon", Gan: "Ganondorf", Wol: "Wolf", ZSS: "Zero Suit Samus", Fox: "Fox", Marth: "Marth", Sheik: "Sheik" };
  return { key, code, mod, name: (mod ? MODS[code] : BASE[code]) || MODS[code] || BASE[code] || code };
}
async function r2Refresh() { r2 = await api.r2Data(); if (cfg.game === "rivals") render(); }

// per character rows from the stats save (your main tag)
function r2CharRows() {
  const s = r2?.stats; if (!s) return [];
  const keys = new Set([...Object.keys(s.Wins || {}), ...Object.keys(s.Losses || {})]);
  return [...keys].map((k) => {
    const g = (st) => r2sum(s[st]?.[k]);
    const w = g("Wins"), l = g("Losses"), m = w + l;
    return { c: r2charName(k), w, l, m, wr: pct(w, m), ko: g("KOs"), de: g("Deaths"), sd: g("Falls"), dd: g("DamageDealt"), dt: g("DamageTaken"),
      pa: g("ParryAttempts"), ps: g("ParrySuccesses"), ga: g("GrabAttempts"), gs: g("GrabSuccesses"), hrs: g("PlaytimeInFrames") / 60 / 3600 };
  }).filter((r) => r.m > 0).reduce((acc, r) => { // different Workshop versions of the same character → one row
    const x = acc.find((y) => y.c.name === r.c.name);
    if (!x) acc.push({ ...r, versions: 1 });
    else { for (const k of ["w", "l", "m", "ko", "de", "sd", "dd", "dt", "pa", "ps", "ga", "gs", "hrs"]) x[k] += r[k]; x.wr = pct(x.w, x.m); x.versions++; }
    return acc;
  }, []).map((r) => (r.c.name === "Random" ? { ...r, c: { ...r.c, name: "Random pick" } } : r)).sort((a, b) => b.m - a.m);
}
function r2Totals(rows) {
  const t = rows.reduce((a, r) => { for (const k of ["w", "l", "m", "ko", "de", "sd", "dd", "dt", "pa", "ps", "ga", "gs"]) a[k] = (a[k] || 0) + r[k]; return a; }, {});
  return t;
}
const ratio = (a, b) => (b ? +(a / b).toFixed(2) : null);

function renderR2Home() {
  if (!r2) return `<div class="page"><div class="card empty">Loading Rivals 2…</div></div>`;
  if (!r2.available) return `<div class="page"><div class="card empty"><h2 style="color:var(--text);margin-bottom:6px">Rivals of Aether II not found</h2>
    Melee Coach looks for the game's data in <code>${esc(r2.root)}</code>. Launch Rivals 2 once and it will show up here.</div></div>`;
  const rows = r2CharRows(), t = r2Totals(rows);
  const recent = r2.games.slice(0, 8);
  const tile = (label, v, sub, tone) => `<div class="stat"><span>${label}</span><b style="color:${tone || "var(--text)"}">${v}</b><span class="sub">${sub}</span></div>`;
  return `<div class="page">
    <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap"><div><h1 style="margin:0;font-size:22px">Rivals of Aether II</h1>
      <div class="sub">Tag ${esc(r2.tag || "–")} · from the game's own stats and your replays</div></div>
      ${cfg.obs?.enabled ? `<button class="btn end" data-act="obsSave" title="Save OBS's replay buffer now and attach it to your latest game">Save clip now</button>` : `<button class="linkbtn end" data-go="settings">Set up OBS clips →</button>`}</div>
    <section class="card"><div class="card-head"><h2>All time</h2><span class="sub">every character, online and local</span></div>
      <div class="mustats">
        ${tile("Record", `${t.w || 0}–${t.l || 0}`, `${fmt(pct(t.w, t.m), "%")} wins`, pct(t.w, t.m) >= 50 ? "var(--teal)" : "var(--red)")}
        ${tile("KOs per death", fmt(ratio(t.ko, t.de)), `${t.ko || 0} KOs · ${t.de || 0} deaths`)}
        ${tile("Damage per match", fmt(t.m ? Math.round(t.dd / t.m) : null, "%"), `takes ${fmt(t.m ? Math.round(t.dt / t.m) : null, "%")}`)}
        ${tile("Parry success", fmt(pct(t.ps, t.pa), "%"), `${t.ps || 0} of ${t.pa || 0}`)}
        ${tile("Grab success", fmt(pct(t.gs, t.ga), "%"), `${t.gs || 0} of ${t.ga || 0}`)}
        ${tile("Self-destructs", fmt(t.m ? +(t.sd / t.m).toFixed(2) : null), "per match")}
      </div></section>
    <section class="card"><div class="card-head"><h2>Your characters</h2><span class="sub">sorted by matches played</span></div>
      <div class="r2table" role="table">
        <div class="r2row head" role="row"><span>Character</span><span>Record</span><span>Win %</span><span>KO / death</span><span>Damage dealt / taken</span><span>Parry</span><span>Grab</span><span>Hours</span></div>
        ${rows.map((r) => `<div class="r2row" role="row"><span class="nm">${r2chip(r.c, 24)}<span>${r2name(r.c)}${r.versions > 1 ? ` <span class="sub">${r.versions} mods</span>` : ""}</span></span><span>${r.w}–${r.l}</span>
          <span style="color:${r.wr >= 50 ? "var(--teal)" : "var(--red)"}">${fmt(r.wr, "%")}</span><span>${fmt(ratio(r.ko, r.de))}</span>
          <span>${Math.round(r.dd / r.m)}% / ${Math.round(r.dt / r.m)}%</span><span>${fmt(pct(r.ps, r.pa), "%")}</span><span>${fmt(pct(r.gs, r.ga), "%")}</span><span>${r.hrs.toFixed(1)}</span></div>`).join("")}
      </div></section>
    <section class="card"><div class="card-head"><h2>Recent games</h2><button class="linkbtn end" data-go="games">All games →</button></div>
      ${recent.length ? `<div class="wlist">${recent.map(r2GameRow).join("")}</div>` : `<div class="sub" style="margin-top:8px">No replays yet.</div>`}</section>
    <section class="card note"><b>What's tracked for Rivals 2 so far</b>
      <p class="sub" style="margin:6px 0 0;line-height:1.55">Results, KOs, damage, parries and grabs come from the game's own stats, matched to each new game as it ends. Games from before Melee Coach was running show characters, stage and length only. Hitfalls, wavedashes, combos and live cues need the replay's frame data, which isn't decoded yet.</p></section>
  </div>`;
}
function r2GameRow(g) {
  const res = g.result === "win" ? `<span class="res w">W</span>` : g.result === "loss" ? `<span class="res l">L</span>` : `<span class="res">–</span>`;
  const st = g.stats;
  return `<div class="r2game"><span class="t">${when(g.startedAt)}</span>${r2chip(g.me, 26)}<span class="vs">vs</span>${g.opp ? r2chip(g.opp, 26) : ""}
    <span style="min-width:0;flex:1"><b>${r2name(g.me)} vs ${g.opp ? r2name(g.opp) : "–"} ${res}</b>
      <span class="sub">${esc(g.stage)} · ${secs(g.durationSec)}${g.mode ? ` · ${g.mode}` : ""}${st ? ` · ${st.kos} KO · ${st.deaths} deaths · ${Math.round(st.dmgDealt)}% dealt${st.grabTry ? ` · grabs ${st.grabOk}/${st.grabTry}` : ""}${st.parryTry ? ` · parries ${st.parryOk}/${st.parryTry}` : ""}` : ""}</span></span>
    ${g.clip ? `<button class="btn" data-clipfile="${esc(g.clip)}" data-title="${esc(`${g.me?.name || ""} vs ${g.opp?.name || ""}`)}">▶ Clip</button>` : ""}
    <button class="linkbtn" data-r2hide="${esc(g.id)}" title="Hide this from your history (e.g. a training session)">Hide</button></div>`;
}
function renderR2Games() {
  if (!r2?.available) return renderR2Home();
  const byDay = {}; for (const g of r2.games) (byDay[day(g.startedAt)] ||= []).push(g);
  return `<div class="page"><div><h1 style="margin:0;font-size:22px">Rivals 2 games</h1><div class="sub">${r2.games.length} games · Rivals keeps the last 128 replays; Melee Coach keeps the history</div></div>
    ${Object.entries(byDay).map(([d, l]) => `<section class="card"><div class="card-head"><h2>${esc(d)}</h2><span class="sub">${l.length} game${l.length === 1 ? "" : "s"}${(() => { const w = l.filter((g) => g.result === "win").length, lo = l.filter((g) => g.result === "loss").length; return w + lo ? ` · ${w}–${lo}` : ""; })()}</span></div>
      <div class="wlist">${l.map(r2GameRow).join("")}</div></section>`).join("") || `<div class="card empty">No replays yet.</div>`}</div>`;
}
function renderR2Matchups() {
  if (!r2?.available) return renderR2Home();
  const by = {}; for (const g of r2.games) if (g.opp) (by[g.opp.name] ||= { c: g.opp, l: [] }).l.push(g);
  const list = Object.values(by).sort((a, b) => b.l.length - a.l.length);
  if (!ui.r2mu || !by[ui.r2mu]) ui.r2mu = list[0]?.c.name;
  const cur = by[ui.r2mu];
  const rec = (l) => ({ w: l.filter((g) => g.result === "win").length, l: l.filter((g) => g.result === "loss").length });
  const r = cur ? rec(cur.l) : { w: 0, l: 0 }; const known = cur ? cur.l.filter((g) => g.stats) : [];
  const sum = (k) => known.reduce((a, g) => a + (g.stats[k] || 0), 0);
  const note = (cfg.r2Notes || {})[ui.r2mu] || "";
  return `<div class="page"><div><h1 style="margin:0;font-size:22px">Rivals 2 matchups</h1><div class="sub">Your record against each character, from your replays</div></div>
    <div class="review">
      <nav class="mulist" aria-label="Opponents">${list.map((x) => { const rr = rec(x.l); const w = pct(rr.w, rr.w + rr.l);
        return `<button class="murow ${x.c.name === ui.r2mu ? "sel" : ""}" data-r2mu="${esc(x.c.name)}">${r2chip(x.c, 26)}<span style="flex:1;min-width:0"><b>${esc(x.c.name)}</b><span class="sub">${x.l.length} game${x.l.length === 1 ? "" : "s"}${rr.w + rr.l ? ` · ${rr.w}–${rr.l}` : ""}</span></span>
          <span class="wr" style="color:${w == null ? "var(--muted)" : w >= 50 ? "var(--teal)" : "var(--red)"}">${w == null ? "–" : w + "%"}</span></button>`; }).join("") || `<div class="sub">No opponents yet.</div>`}</nav>
      <div class="mdetail">${cur ? `
        <section class="card"><div class="card-head">${r2chip(cur.c, 40)}<div><h2 style="margin:0">vs ${r2name(cur.c)}</h2><span class="sub">${cur.l.length} game${cur.l.length === 1 ? "" : "s"} · last ${day(cur.l[0].startedAt)}</span></div>
          ${r.w + r.l ? `<div class="end murec"><b style="color:${r.w >= r.l ? "var(--teal)" : "var(--red)"}">${r.w}–${r.l}</b><span class="sub">${pct(r.w, r.w + r.l)}% wins</span></div>` : ""}</div>
          ${known.length ? `<div class="mustats">
            <div class="stat"><span>KOs per death</span><b>${fmt(ratio(sum("kos"), sum("deaths")))}</b><span class="sub">${known.length} tracked games</span></div>
            <div class="stat"><span>Damage per game</span><b>${Math.round(sum("dmgDealt") / known.length)}%</b><span class="sub">takes ${Math.round(sum("dmgTaken") / known.length)}%</span></div>
            <div class="stat"><span>Grab success</span><b>${fmt(pct(sum("grabOk"), sum("grabTry")), "%")}</b><span class="sub">${sum("grabOk")} of ${sum("grabTry")}</span></div>
            <div class="stat"><span>Parry success</span><b>${fmt(pct(sum("parryOk"), sum("parryTry")), "%")}</b><span class="sub">${sum("parryOk")} of ${sum("parryTry")}</span></div>
            <div class="stat"><span>Avg game length</span><b>${secs(cur.l.reduce((a, g) => a + g.durationSec, 0) / cur.l.length)}</b><span class="sub">all games</span></div></div>`
            : `<div class="sub" style="margin-top:12px">Per-game numbers start with games played while Melee Coach is open.</div>`}</section>
        <section class="card"><div class="card-head"><h2>Your notes</h2><span class="sub">what works, what to avoid vs ${esc(cur.c.name)}</span></div>
          <textarea class="r2notes" data-r2note="${esc(ui.r2mu)}" placeholder="e.g. Shield their side special, then punish. Don't jump over projectiles.">${esc(note)}</textarea></section>
        <section class="card"><div class="card-head"><h2>Games</h2></div><div class="wlist">${cur.l.map(r2GameRow).join("")}</div></section>` : `<div class="card empty">No games yet.</div>`}
      </div></div></div>`;
}
function bindR2(el) {
  $$("[data-r2mu]", el).forEach((b) => b.onclick = () => { ui.r2mu = b.dataset.r2mu; render(); });
  $$("[data-r2hide]", el).forEach((b) => b.onclick = async () => { await api.r2Hide(b.dataset.r2hide); r2Refresh(); });
  $$("[data-r2note]", el).forEach((t) => { let tm = null; t.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { cfg = await api.setConfig({ r2Notes: { ...(cfg.r2Notes || {}), [t.dataset.r2note]: t.value } }); }, 600); }; });
}
