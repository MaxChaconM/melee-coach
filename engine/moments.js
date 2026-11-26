// Finds "moments": mistakes the opponent actually punished. Rule-based, runs once per game.
const T = (f) => { const s = Math.max(0, Math.round(f / 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function findMoments(g) {
  const theirs = g.conversions.filter((c) => c.side === "theirs");
  const out = [];
  const push = (m) => out.push({
    gameId: g.id, opp: g.oppChar, stage: g.stage, time: T(m.frame), startedAt: g.startedAt,
    window: [Math.max(0, m.frame - 150), m.frame + 180], ...m,
  });
  const severityOf = (c) => (c.killed ? 3 : c.damage >= 30 ? 2 : c.damage >= 15 ? 1 : 0);
  const tagOf = (c) => (c.killed ? "Lost stock" : `${Math.round(c.damage)}% punish`);

  for (const st of g.stocks) {
    // 1) missed L-cancel -> opponent opening starts during/just after the landing lag
    for (const l of st.landings) {
      if (l.ok) continue;
      const c = theirs.find((x) => x.start > l.frame && x.start - l.frame <= 25);
      if (!c || severityOf(c) === 0) continue;
      const how = l.timing === "early" ? `pressed L ${l.frames} frame${l.frames > 1 ? "s" : ""} too early`
        : l.timing === "late" ? `pressed L ${l.frames} frame${l.frames > 1 ? "s" : ""} too late` : "no L/R/Z press";
      const word = l.timing === "early" ? "Early" : l.timing === "late" ? "Late" : "Missed";
      push({ type: "lcancel", frame: l.frame, stock: st.n, severity: severityOf(c), tag: tagOf(c), killed: c.killed, damage: c.damage,
        title: `${word} ${l.aerial} L-cancel → ${g.oppChar} ${c.opener}`,
        detail: `On a ${l.aerial} landing you ${how}, so you took the full landing lag. ${g.oppChar} started a punish with ${c.opener}` +
          (c.killed ? " and it took the stock." : ` worth ${Math.round(c.damage)}%.`),
        aerial: l.aerial, timing: l.timing, frames: l.frames });
    }
    // 2) missed tech inside an opponent opening
    for (const f of st.missedTechFrames || []) {
      const c = theirs.find((x) => x.start <= f && f <= x.last + 10);
      if (!c || severityOf(c) < 2) continue;
      push({ type: "tech", frame: f, stock: st.n, severity: severityOf(c), tag: tagOf(c), killed: c.killed, damage: c.damage,
        title: `Missed tech → ${c.killed ? "lost stock" : Math.round(c.damage) + "% punish"}`,
        detail: `You missed a tech during ${g.oppChar}'s combo and they kept the punish going` + (c.killed ? " to take the stock." : ` for ${Math.round(c.damage)}%.`) });
    }
    // 3) same getup / ledge option repeated, and the last one got punished
    for (const [seqKey, label] of [["getupSeq", "getup"], ["ledgeSeq", "ledge option"]]) {
      const seq = st[seqKey] || [];
      for (let i = 2; i < seq.length; i++) {
        let run = 1; while (i - run >= 0 && seq[i - run][1] === seq[i][1]) run++;
        if (run < 3) continue;
        const f = seq[i][0];
        const c = theirs.find((x) => x.start >= f && x.start - f <= 60);
        if (!c || severityOf(c) < 2) continue;
        push({ type: "habit", frame: f, stock: st.n, severity: severityOf(c), tag: tagOf(c), killed: c.killed, damage: c.damage,
          title: `${seq[i][1]} ${run}× in a row → punished`,
          detail: `That was your ${ordinal(run)} ${seq[i][1]} in a row this stock. ${g.oppChar} covered it with ${c.opener}` +
            (c.killed ? " and took the stock." : ` for ${Math.round(c.damage)}%.`) });
      }
    }
  }
  return out.sort((a, b) => b.severity - a.severity || b.damage - a.damage);
}
const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

module.exports = { findMoments };
