// Per-game coaching logic. Fed one finalized frame at a time (pre + post data for every port).
const CHAR = ["Falcon","DK","Fox","Game & Watch","Kirby","Bowser","Link","Luigi","Mario","Marth","Mewtwo","Ness",
  "Peach","Pikachu","Ice Climbers","Puff","Samus","Yoshi","Zelda","Sheik","Falco","Young Link","Doc","Roy","Pichu","Ganon"];
const STAGE = { 2: "Fountain of Dreams", 3: "Pokémon Stadium", 8: "Yoshi's Story", 28: "Dream Land", 31: "Battlefield", 32: "Final Destination" };
const MOVE = {1:"misc",2:"jab",3:"jab",4:"jab",5:"rapid jab",6:"dash attack",7:"ftilt",8:"utilt",9:"dtilt",10:"fsmash",
  11:"usmash",12:"dsmash",13:"nair",14:"knee",15:"bair",16:"uair",17:"stomp",18:"falcon punch",19:"raptor boost",
  20:"falcon dive",21:"falcon kick",50:"getup attack",51:"getup attack",52:"pummel",53:"fthrow",54:"bthrow",
  55:"uthrow",56:"dthrow",61:"ledge attack",62:"ledge attack"};
const AERIAL = { 70: "nair", 71: "fair", 72: "bair", 73: "uair", 74: "dair" };
// Generic names for any character; Falcon gets his own where they differ.
const GENERIC = {13:"nair",14:"fair",15:"bair",16:"uair",17:"dair",18:"neutral-B",19:"side-B",20:"up-B",21:"down-B"};
const moveName = (id, charId) => (charId === 0 ? MOVE[id] : GENERIC[id] || MOVE[id]) || null;

const isHitstun = (s) => (s >= 75 && s <= 91) || s === 38;
// "being punished": hitstun, grabbed/held, thrown, knocked down on the floor
const isPunished = (s) => isHitstun(s) || (s >= 223 && s <= 232) || (s >= 239 && s <= 243) || (s >= 183 && s <= 198);
const MISSED_TECH = new Set([183, 191]);
const LYING = new Set([183, 184, 191, 192]);
const GETUP = { 186: "stand up", 194: "stand up", 187: "getup attack", 195: "getup attack",
                188: "roll", 196: "roll", 189: "roll", 197: "roll" };
const TECH = { 199: "tech in place", 200: "tech roll", 201: "tech roll" };
const LC_MASK = 0x10 | 0x20 | 0x40 | 0x80000000; // Z, R, L, analog L/R past threshold
const LC_WINDOW = 7;      // frames an L/R/Z press stays "live" before landing
const CONV_GAP = 45;      // frames out of stun before an opening is considered over

class Side {
  constructor() { this.prev = null; this.prevPre = null; }
}

class GameCoach {
  constructor(settings, me, opp, cfg, audio, meta = {}) {
    this.cfg = cfg; this.audio = audio; this.me = me; this.opp = opp;
    this.oppHabits = { techs: 0, missedTechs: 0, tech: {}, getups: {}, ledge: {} };
    this.meta = {
      id: meta.id, file: meta.file || null, startedAt: meta.startedAt || new Date().toISOString(),
      stage: STAGE[settings.stageId] || `Stage ${settings.stageId}`,
      myChar: CHAR[me.characterId] || "?", oppChar: CHAR[opp.characterId] || "?",
      myCode: me.connectCode || null, oppCode: opp.connectCode || null,
      oppName: opp.displayName || opp.nametag || null, online: !!opp.connectCode, vsCpu: opp.type === 1,
    };
    this.my = new Side(); this.op = new Side();
    this.frameNo = 0; this.lastFrame = null;
    this.lcPresses = [];          // frames with a fresh L/R/Z press
    this.pendingLate = [];        // missed L-cancels waiting to see if a late press shows up
    this.stocks = [];             // per-stock records
    this.startStocks = null;
    this.conv = { mine: null, theirs: null };
    this.conversions = [];        // all openings, both sides
    this.jab = { inJab3: false };
    this.getupHist = []; this.ledgeHist = []; this.pendingDrop = null;
    this.lastHitMove = null;
    console.log(`\n=== Game start: you (${this.meta.myChar}, port ${me.playerIndex + 1}) vs ${this.meta.oppChar} on ${this.meta.stage} ===`);
  }

  stock() {
    if (!this.stocks.length) this.newStock();
    return this.stocks[this.stocks.length - 1];
  }
  newStock() {
    this.stocks.push({
      n: this.stocks.length + 1, startFrame: this.frameNo, endFrame: null, lostBy: null, killMove: null,
      landings: [], techs: 0, missedTechs: 0, tech: {}, getups: {}, ledge: {},
      jab3: 0, gentlemen: 0, rapid: 0, knees: 0, sweetKnees: 0,
      dmgDealt: 0, dmgTaken: 0, kills: 0,
    });
  }

  frame(fr) {
    const mp = fr.players?.[this.me.playerIndex], op = fr.players?.[this.opp.playerIndex];
    if (!mp?.post || !op?.post || !mp.pre) return;
    const f = fr.frame; this.frameNo = f; this.lastFrame = fr;
    const m = mp.post, o = op.post, pre = mp.pre;
    const pm = this.my.prev, po = this.op.prev;
    if (this.startStocks === null) this.startStocks = m.stocksRemaining;
    const st = this.stock();
    const s = m.actionStateId, p = pm?.actionStateId;

    // --- L/R/Z press edges (for L-cancel timing) ---
    const lc = (pre.buttons >>> 0) & LC_MASK;
    const lcPrev = this.my.prevPre ? (this.my.prevPre.buttons >>> 0) & LC_MASK : 0;
    if (lc && !lcPrev) { this.lcPresses.push(f); if (this.lcPresses.length > 20) this.lcPresses.shift(); }

    // late presses for pending missed L-cancels
    this.pendingLate = this.pendingLate.filter((pl) => {
      if (lc && !lcPrev && f > pl.frame) { pl.rec.timing = "late"; pl.rec.frames = f - pl.frame; return false; }
      if (f - pl.frame > 12) { pl.rec.timing = "no press"; return false; }
      return true;
    });

    // --- 1) L-cancel on landing ---
    if (m.lCancelStatus && m.lCancelStatus !== pm?.lCancelStatus) {
      const aerial = AERIAL[s] || (p >= 65 && p <= 69 ? AERIAL[p + 5] : "aerial");
      const last = [...this.lcPresses].reverse().find((x) => x <= f);
      const d = last === undefined ? null : f - last;
      const rec = { aerial, ok: m.lCancelStatus === 1, timing: null, frames: null, frame: f };
      if (rec.ok) { rec.timing = "ok"; rec.frames = d; }
      else if (d !== null && d >= LC_WINDOW && d <= 30) { rec.timing = "early"; rec.frames = Math.max(1, d - LC_WINDOW); }
      else this.pendingLate.push({ frame: f, rec });
      st.landings.push(rec);
      if (this.cfg.callouts.lcancel) {
        if (!rec.ok) this.audio.play("lcancel_miss");
        else if (this.cfg.lcancelSuccessTick) this.audio.play("lcancel_hit");
      }
    }

    if (p !== undefined && s !== p) {
      // --- 2) techs ---
      if (isHitstun(p)) {
        if (MISSED_TECH.has(s)) {
          st.missedTechs++; st.techs++; (st.missedTechFrames ||= []).push(f);
          if (this.cfg.callouts.missedTech) this.audio.play("tech_miss");
        } else if (TECH[s]) { st.techs++; st.tech[TECH[s]] = (st.tech[TECH[s]] || 0) + 1; }
      }
      if (LYING.has(p) && GETUP[s]) { this.record(st.getups, this.getupHist, GETUP[s], "getup", 4, 3); (st.getupSeq ||= []).push([f, GETUP[s]]); }

      // --- 3) ledge ---
      if (p === 253 || (p === 252 && s !== 253)) {
        if (s === 254 || s === 255) this.ledge(st, "ledge getup");
        else if (s === 256 || s === 257) this.ledge(st, "ledge attack");
        else if (s === 258 || s === 259) this.ledge(st, "ledge roll");
        else if (s >= 260 && s <= 263) this.ledge(st, "ledge jump");
        else if (s >= 29 && s <= 34) this.pendingDrop = { frame: f, sawJump: false };
      }

      // --- 4) jab string: gentleman vs rapid jab (Falcon) ---
      if (s === 46) { st.jab3++; this.jab.inJab3 = true; }
      if (p === 46 && this.jab.inJab3) {
        if (s === 47) st.rapid++; else st.gentlemen++;
        this.jab.inJab3 = false;
      }
    }
    if (this.pendingDrop) {
      if (s === 27 || s === 28) this.pendingDrop.sawJump = true;
      if (s === 236) { this.ledge(st, "ledgedash"); this.pendingDrop = null; }
      else if (f - this.pendingDrop.frame > 20 || s === 252) {
        this.ledge(st, this.pendingDrop.sawJump ? "drop + jump" : "drop"); this.pendingDrop = null;
      }
    }

    // --- 5) damage, knees, conversions ---
    if (po) {
      const dealt = o.percent - po.percent;
      if (dealt > 0.01) {
        st.dmgDealt += dealt;
        if (m.lastAttackLanded === 14 && (s === 66 || p === 66)) { st.knees++; if (dealt >= 10) st.sweetKnees++; }
      }
      if (pm) { const taken = m.percent - pm.percent; if (taken > 0.01) st.dmgTaken += taken; }
    }
    this.trackConversion("mine", o, po, moveName(m.lastAttackLanded, this.me.characterId), f);
    this.trackConversion("theirs", m, pm, moveName(o.lastAttackLanded, this.opp.characterId), f);

    // --- stock changes ---
    if (po && o.stocksRemaining < po.stocksRemaining) {
      st.kills++;
      this.endConversion("mine", f, true);
    }
    if (pm && m.stocksRemaining < pm.stocksRemaining) {
      st.endFrame = f; st.lostBy = "ko";
      st.killMove = moveName(o.lastAttackLanded, this.opp.characterId);
      this.endConversion("theirs", f, true);
      this.flushPending();
      if (m.stocksRemaining > 0) this.newStock();
    }

    // opponent habits (for the opponent notes): their techs, getups and ledge options
    const oPrev = this.op.prev?.actionStateId, oNow = o?.actionStateId;
    if (oPrev !== undefined && oNow !== undefined && oNow !== oPrev) {
      const H = this.oppHabits;
      if (isHitstun(oPrev)) { if (MISSED_TECH.has(oNow)) H.missedTechs++; else if (TECH[oNow]) { H.techs++; H.tech[TECH[oNow]] = (H.tech[TECH[oNow]] || 0) + 1; } }
      if (LYING.has(oPrev) && GETUP[oNow]) H.getups[GETUP[oNow]] = (H.getups[GETUP[oNow]] || 0) + 1;
      if (oPrev === 253 || (oPrev === 252 && oNow !== 253)) {
        const opt = oNow === 254 || oNow === 255 ? "ledge getup" : oNow === 256 || oNow === 257 ? "ledge attack" : oNow === 258 || oNow === 259 ? "ledge roll" : oNow >= 260 && oNow <= 263 ? "ledge jump" : oNow >= 29 && oNow <= 34 ? "drop" : null;
        if (opt) H.ledge[opt] = (H.ledge[opt] || 0) + 1;
      }
    }
    this.my.prev = m; this.my.prevPre = pre; this.op.prev = o;
  }

  ledge(st, opt) { this.record(st.ledge, this.ledgeHist, opt, "ledge", 3, 3); (st.ledgeSeq ||= []).push([this.frameNo, opt]); }
  record(bucket, hist, opt) { bucket[opt] = (bucket[opt] || 0) + 1; hist.push(opt); if (hist.length > 4) hist.shift(); }

  // An opening starts when the victim enters a punished state after being free for CONV_GAP frames.
  trackConversion(side, victim, victimPrev, attackerMove, f) {
    const c = this.conv[side];
    const punished = isPunished(victim.actionStateId);
    if (punished) {
      if (!c) {
        this.conv[side] = { side, stock: this.stock().n, start: f, last: f, startPct: victimPrev ? victimPrev.percent : victim.percent,
          endPct: victim.percent, opener: attackerMove || "other", hits: 0, killed: false, moves: [] };
      } else c.last = f;
      const cc = this.conv[side];
      if (victimPrev && victim.percent > victimPrev.percent + 0.01) { cc.hits++; cc.endPct = victim.percent; if (cc.moves.length < 40) cc.moves.push(attackerMove || "other"); }
    } else if (c && f - c.last > CONV_GAP) this.endConversion(side, f, false);
  }
  endConversion(side, f, killed) {
    const c = this.conv[side];
    if (!c) {
      // stock lost after the combo already "ended" (e.g. sent offstage, failed recovery): credit the last opening
      if (killed) { const prev = [...this.conversions].reverse().find((x) => x.side === side); if (prev && f - prev.last < 360) { prev.killed = true; prev.killLate = true; } }
      return;
    }
    c.killed = killed; c.damage = Math.round(Math.max(0, c.endPct - c.startPct) * 10) / 10; c.frames = c.last - c.start;
    if (c.hits > 0 || killed) this.conversions.push(c);
    this.conv[side] = null;
  }
  flushPending() { for (const pl of this.pendingLate) pl.rec.timing = pl.rec.timing || "no press"; this.pendingLate = []; }

  snapshot() {
    const st = this.stock(); const m = this.my.prev, o = this.op.prev;
    const l = this.stocks.flatMap((x) => x.landings);
    return {
      meta: this.meta, stock: st.n,
      me: m ? { stocks: m.stocksRemaining, percent: Math.round(m.percent) } : null,
      opp: o ? { stocks: o.stocksRemaining, percent: Math.round(o.percent) } : null,
      lcStock: { ok: st.landings.filter((x) => x.ok).length, total: st.landings.length },
      lcGame: { ok: l.filter((x) => x.ok).length, total: l.length },
      missedTechs: this.stocks.reduce((a, x) => a + x.missedTechs, 0),
      techs: this.stocks.reduce((a, x) => a + x.techs, 0),
      gentlemen: this.stocks.reduce((a, x) => a + x.gentlemen, 0),
      jab3: this.stocks.reduce((a, x) => a + x.jab3, 0),
    };
  }

  end(gameEnd) {
    this.flushPending();
    this.endConversion("mine", this.frameNo, false); this.endConversion("theirs", this.frameNo, false);
    const last = this.lastFrame; const m = last?.players?.[this.me.playerIndex]?.post, o = last?.players?.[this.opp.playerIndex]?.post;
    const st = this.stock(); if (st.endFrame === null) st.endFrame = this.frameNo;
    let result = "unknown";
    const pl = gameEnd?.placements?.find((x) => x.playerIndex === this.me.playerIndex);
    if (pl && pl.position !== null && pl.position !== undefined && gameEnd?.gameEndMethod !== 7) result = pl.position === 0 ? "win" : "loss";
    if (result === "unknown" && m && o && gameEnd?.gameEndMethod !== 7)
      result = m.stocksRemaining > o.stocksRemaining ? "win" : m.stocksRemaining < o.stocksRemaining ? "loss" : "unknown";
    const game = {
      ...this.meta, result, endMethod: gameEnd?.gameEndMethod ?? null, complete: gameEnd?.gameEndMethod !== 7,
      v: 3, oppHabits: this.oppHabits, durationFrames: this.frameNo, endStocks: { me: m?.stocksRemaining ?? null, opp: o?.stocksRemaining ?? null },
      stocks: this.stocks.map((x) => ({ ...x, dmgDealt: Math.round(x.dmgDealt), dmgTaken: Math.round(x.dmgTaken) })),
      conversions: this.conversions,
    };
    game.totals = totals(game);
    const t = game.totals;
    console.log(`=== Game over vs ${game.oppChar}: ${result} ===  L-cancel ${t.lcOk}/${t.lcTotal}  missed techs ${t.missedTechs}/${t.techs}  gentlemen ${t.gentlemen}/${t.jab3}`);
    return game;
  }
}

// Aggregate numbers used by the UI (also recomputed for imported games).
function totals(g) {
  const land = g.stocks.flatMap((s) => s.landings);
  const sum = (k) => g.stocks.reduce((a, s) => a + (s[k] || 0), 0);
  const mine = g.conversions.filter((c) => c.side === "mine"), theirs = g.conversions.filter((c) => c.side === "theirs");
  const merge = (k) => g.stocks.reduce((a, s) => { for (const [x, v] of Object.entries(s[k])) a[x] = (a[x] || 0) + v; return a; }, {});
  const kills = sum("kills"), deaths = g.stocks.filter((s) => s.lostBy === "ko").length;
  return {
    lcOk: land.filter((x) => x.ok).length, lcTotal: land.length,
    lcEarly: land.filter((x) => x.timing === "early").length, lcLate: land.filter((x) => x.timing === "late").length,
    lcNone: land.filter((x) => x.timing === "no press").length,
    techs: sum("techs"), missedTechs: sum("missedTechs"), jab3: sum("jab3"), gentlemen: sum("gentlemen"), rapid: sum("rapid"),
    knees: sum("knees"), sweetKnees: sum("sweetKnees"), dmgDealt: sum("dmgDealt"), dmgTaken: sum("dmgTaken"),
    openings: mine.length, oppOpenings: theirs.length, kills, deaths,
    openingsPerKill: kills ? +(mine.length / kills).toFixed(1) : null,
    oppOpeningsPerKill: deaths ? +(theirs.length / deaths).toFixed(1) : null,
    dmgPerOpening: mine.length ? +(mine.reduce((a, c) => a + c.damage, 0) / mine.length).toFixed(1) : null,
    oppDmgPerOpening: theirs.length ? +(theirs.reduce((a, c) => a + c.damage, 0) / theirs.length).toFixed(1) : null,
    neutralWin: mine.length + theirs.length ? Math.round((100 * mine.length) / (mine.length + theirs.length)) : null,
    getups: merge("getups"), ledge: merge("ledge"), tech: merge("tech"),
  };
}

module.exports = { GameCoach, totals, CHAR, STAGE };
