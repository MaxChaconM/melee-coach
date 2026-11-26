// Finds what you did well in a game: clean or creative strings, early kills, comebacks,
// perfect L-cancel / tech stocks. Works on a finished game object (from coach.end()).

// Finishers that are uncommon (for Falcon, or any character's generic names) and earn style points.
const STYLE_FINISH = new Set(["falcon punch", "stomp", "raptor boost", "falcon dive", "falcon kick", "utilt", "dtilt", "ftilt",
  "jab", "rapid jab", "dash attack", "fthrow", "bthrow", "uthrow", "dthrow", "pummel", "getup attack", "ledge attack", "nair",
  "neutral-B", "side-B", "down-B", "dair"]);
const NICE = { stomp: "Stomp", "falcon punch": "Falcon Punch", "raptor boost": "Raptor Boost", "falcon kick": "Falcon Kick", "falcon dive": "Falcon Dive" };
const nice = (m) => NICE[m] || m;

function findHighlights(g) {
  const out = [];
  const convs = (g.conversions || []).filter((c) => c.side === "mine");
  const pct = (v) => `${Math.round(v)}%`;

  // ---- strings and kills ----
  for (const c of convs) {
    const moves = c.moves && c.moves.length ? c.moves : [c.opener];
    const real = moves.filter((m) => m && m !== "pummel" && m !== "other"); // pummels don't make a combo
    const hits = c.moves && c.moves.length ? real.length : c.hits;
    const distinct = new Set(real).size;
    const last = moves[moves.length - 1];
    const tags = []; let score = 0, title = null;
    if (c.killed) {
      if (c.startPct <= 15 && hits >= 3) { tags.push("zero-to-death"); score += 5; title = `Zero-to-death`; }
      if (c.killLate && c.endPct < 90 && c.endPct >= 25) { tags.push("gimp"); score += 3; title ||= `Offstage gimp at ${pct(c.endPct)}`; }
      else if (c.endPct < 70 && c.endPct >= 20) { tags.push("early kill"); score += 3; title ||= `Early kill at ${pct(c.endPct)}`; }
      if (last === "falcon punch") { tags.push("falcon punch"); score += 5; title = title ? `${title}, finished with a Falcon Punch` : "Falcon Punch kill"; }
      else if (STYLE_FINISH.has(last)) { tags.push("style"); score += 3; title ||= `${nice(last)} to finish the stock`; }
      if (hits >= 3 && last === "knee" && !title) { score += 2; title = `${hits}-hit string into the knee`; }
    }
    if (hits >= 5) { score += Math.min(4, hits - 3); title ||= `${hits}-hit combo`; tags.push("long string"); }
    if (distinct >= 4) { score += 2; title ||= "Creative string"; tags.push("creative"); }
    if (!c.killed && c.damage >= 45) { score += 2; title ||= `${pct(c.damage)} punish`; tags.push("big punish"); }
    if (!title || score < 3) continue;
    const groups = []; for (const m of moves) { const l = groups[groups.length - 1]; if (l && l[0] === m) l[1]++; else groups.push([m, 1]); }
    const route = groups.slice(0, 8).map(([m, n]) => nice(m) + (n > 1 ? ` ×${n}` : "")).join(" → ") + (groups.length > 8 ? " → …" : "");
    out.push({ type: "good", kind: "string", frame: c.start, end: c.last, stock: c.stock, score, tags, killed: c.killed,
      title, detail: `${route} · ${pct(c.startPct)} → ${pct(c.endPct)}${c.killed ? (c.killLate ? ", they didn't make it back" : ", took the stock") : ""}`, moves });
  }

  // ---- stock-level execution ----
  let streak = 0, best = 0, bestStart = null, curStart = null;
  for (const st of g.stocks || []) {
    const lands = st.landings || [];
    if (lands.length >= 6 && lands.every((l) => l.ok))
      out.push({ type: "good", kind: "lcancel", frame: lands[0].frame, stock: st.n, score: 2, title: `Every L-cancel on stock ${st.n}`, detail: `${lands.length} for ${lands.length}` });
    for (const l of lands) {
      if (l.ok) { if (!streak) curStart = l.frame; streak++; if (streak > best) { best = streak; bestStart = curStart; } } else streak = 0;
    }
    if (st.techs >= 3 && !st.missedTechs)
      out.push({ type: "good", kind: "tech", frame: st.startFrame, stock: st.n, score: 2, title: `Teched everything on stock ${st.n}`, detail: `${st.techs} for ${st.techs}` });
  }
  if (best >= 12 && !out.some((h) => h.kind === "lcancel"))
    out.push({ type: "good", kind: "lcancel", frame: bestStart, stock: (g.stocks || []).find((s) => bestStart >= s.startFrame && (s.endFrame == null || bestStart <= s.endFrame))?.n || 1,
      score: 2, title: `${best} L-cancels in a row`, detail: "consistent landings" });

  // tech/getup mixups: three or more different options and never the same one three times running
  const opts = (g.stocks || []).flatMap((s) => [...Object.entries(s.tech || {}), ...Object.entries(s.getups || {})]);
  const seq = (g.stocks || []).flatMap((s) => (s.getupSeq || []).map((x) => x[1]));
  const kinds = new Set(opts.map(([k]) => k));
  const repeat3 = seq.some((x, i) => i >= 2 && seq[i - 1] === x && seq[i - 2] === x);
  if (kinds.size >= 3 && seq.length >= 3 && !repeat3)
    out.push({ type: "good", kind: "mixup", frame: (g.stocks?.[0]?.getupSeq?.[0]?.[0]) ?? 0, stock: 1, score: 1, title: "Mixed up your tech and getup options", detail: [...kinds].join(", ") });

  // ---- game-level ----
  const t = g.totals || {};
  if ((t.gentlemen || 0) >= 2 && !(t.rapid > 0)) out.push({ type: "good", kind: "gentleman", frame: 0, stock: 1, score: 1, title: `${t.gentlemen} gentlemen`, detail: "no accidental rapid jabs" });
  if (g.result === "win") {
    // stock timeline for comebacks
    const evs = [...convs.filter((c) => c.killed).map((c) => [c.last, 1]), ...(g.stocks || []).filter((s) => s.lostBy === "ko").map((s) => [s.endFrame, -1])].sort((a, b) => a[0] - b[0]);
    let diff = 0, worst = 0; for (const [, d] of evs) { diff += d; worst = Math.min(worst, diff); }
    if (worst <= -2) out.push({ type: "good", kind: "comeback", frame: evs[evs.length - 1]?.[0] ?? 0, stock: (g.stocks || []).length, score: 5, title: `Came back from ${-worst} stocks down`, detail: "won the game" });
    else if (worst <= -1) out.push({ type: "good", kind: "comeback", frame: evs[evs.length - 1]?.[0] ?? 0, stock: (g.stocks || []).length, score: 3, title: "Comeback win", detail: "won after falling behind" });
    if (g.endStocks?.me === 4) out.push({ type: "good", kind: "4stock", frame: 0, stock: 1, score: 5, title: "4-stock", detail: "didn't lose a stock" });
  }
  return out.sort((a, b) => a.frame - b.frame);
}

module.exports = { findHighlights };
