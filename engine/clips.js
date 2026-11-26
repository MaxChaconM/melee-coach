// Renders short video clips of moments using Slippi's own playback Dolphin and your Melee ISO.
// Works on a private copy of the playback Dolphin, so Slippi Launcher's settings are never touched.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const FPS = 60;
const PRE = 180, POST = 120; // 3 s before, 2 s after the moment

class ClipRenderer {
  constructor({ userData, ffmpeg, getCfg, log, windowRect }) {
    this.windowRect = windowRect || (() => null); this.hold = true; this.playing = false; this.proc = null; this.abortReason = null;
    this.dir = path.join(userData, "clips");
    this.work = path.join(userData, "render-dolphin");
    this.ffmpeg = ffmpeg; this.getCfg = getCfg; this.log = log || (() => {});
    fs.mkdirSync(this.dir, { recursive: true });
    this.queue = []; this.busy = false; this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }

  // ---------- locating Slippi ----------
  slippiPaths() {
    const cfg = this.getCfg();
    const launcher = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Slippi Launcher");
    const playback = cfg.playbackDolphinDir || path.join(launcher, "playback");
    let iso = cfg.isoPath || null;
    if (!iso) { try { iso = JSON.parse(fs.readFileSync(path.join(launcher, "Settings"), "utf8")).settings?.isoPath || null; } catch {} }
    return { playback, exe: path.join(playback, "Slippi Dolphin.exe"), iso };
  }
  check() {
    const p = this.slippiPaths();
    const problems = [];
    if (!fs.existsSync(p.exe)) problems.push(`Slippi's playback Dolphin wasn't found at ${p.exe}. Open Slippi Launcher once so it installs it.`);
    if (!p.iso || !fs.existsSync(p.iso)) problems.push(`Melee ISO not found${p.iso ? ` at ${p.iso}` : ""}. Set it in Slippi Launcher or in Settings here.`);
    // ffmpeg isn't shipped in the installer (it's ~80 MB); it downloads once on the first clip.
    return { ok: !problems.length, problems, ...p };
  }

  // ---------- ffmpeg (downloaded on first use) ----------
  async ensureFfmpeg() {
    if (fs.existsSync(this.ffmpeg)) return;
    if (process.platform !== "win32") throw new Error("ffmpeg not found at " + this.ffmpeg);
    this.emit({ type: "ffmpeg", state: "downloading" });
    const url = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64.gz";
    const gz = await fetchBuffer(url);
    const exe = require("zlib").gunzipSync(gz);
    if (exe.length < 10e6 || exe.readUInt16LE(0) !== 0x5a4d) throw new Error("ffmpeg download looked wrong; try again.");
    fs.mkdirSync(path.dirname(this.ffmpeg), { recursive: true });
    fs.writeFileSync(this.ffmpeg + ".part", exe); fs.renameSync(this.ffmpeg + ".part", this.ffmpeg);
    this.emit({ type: "ffmpeg", state: "ready" });
  }

  // ---------- private Dolphin copy ----------
  prepareDolphin(src) {
    const stamp = path.join(this.work, ".source-mtime");
    const srcM = String(fs.statSync(path.join(src, "Slippi Dolphin.exe")).mtimeMs);
    if (!fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8") !== srcM) {
      fs.rmSync(this.work, { recursive: true, force: true });
      fs.cpSync(src, this.work, { recursive: true, filter: (s) => !/[\\/]User[\\/](Cache|Dump|ScreenShots|StateSaves|Logs)([\\/]|$)/.test(s) });
      fs.writeFileSync(stamp, srcM);
    }
    const cfgDir = path.join(this.work, "User", "Config");
    fs.mkdirSync(cfgDir, { recursive: true });
    setIni(path.join(cfgDir, "Dolphin.ini"), {
      Movie: { DumpFrames: "True", DumpFramesSilent: "True" },
      // Mute what you hear (the audio dump is taken before volume, so the video still has sound).
      DSP: { DumpAudio: "True", DumpAudioSilent: "True", Volume: "0" },
      Display: { Fullscreen: "False", KeepWindowOnTop: "False", ...this.dolphinWindow() },
      // The spectator server would look like a live game to Melee Coach, so it's off in this private copy.
      // Jukebox off so the music goes through the game audio (and into the recording); never save replays from here.
      Core: { SlippiPlaybackDisplayFrameIndex: "False", SlippiEnableSpectator: "False", SlippiSaveReplays: "False", SlippiJukeboxEnabled: "False",
        // Fast recording: run playback unthrottled. The dumps are written per emulated frame/sample, so the result should be
        // identical; every fast render is checked (audio vs video length) and redone at normal speed if it isn't.
        EmulationSpeed: this.fastNow ? "0.00000000" : "1.00000000" },
    });
    setIni(path.join(cfgDir, "GFX.ini"), {
      Settings: { InternalResolutionFrameDumps: "True", EFBScale: "3", BitrateKbps: "16000", UseFFV1: "False", DumpFormat: "avi", ShowFPS: "False" },
      Hardware: { VSync: "False" },
    });
    return path.join(this.work, "Slippi Dolphin.exe");
  }

  // Small window tucked in the bottom-right corner so it stays out of the way while recording.
  dolphinWindow() {
    const r = this.windowRect(); const w = 292, h = 240;
    if (!r) return { RenderWindowWidth: String(w), RenderWindowHeight: String(h) };
    return { RenderWindowWidth: String(w), RenderWindowHeight: String(h), RenderWindowXPos: String(r.x + r.width - w - 16), RenderWindowYPos: String(r.y + r.height - h - 16) };
  }

  // A full match is stored as <gameId>_full.mp4; single moments as <gameId>_<frame>.mp4.
  clipPath(gameId, frame) { return path.join(this.dir, `${gameId}_${frame}.mp4`); }
  has(gameId, frame) { return fs.existsSync(this.clipPath(gameId, frame)); }

  // ---------- queue ----------
  // job: { replay, gameId, frame, start?, end?, bg? }  (frame "full" = whole match)
  // Jobs you ask for go to the front; background jobs (bg) wait until you've taken a break.
  request(job) {
    const key = `${job.gameId}_${job.frame}`;
    if (this.has(job.gameId, job.frame)) return Promise.resolve(this.clipPath(job.gameId, job.frame));
    const existing = this.queue.find((j) => j.key === key);
    if (existing) {
      if (!job.bg && existing.bg) { existing.bg = false; this.queue.splice(this.queue.indexOf(existing), 1); this.queue.unshift(existing); this.pump(); }
      return existing.promise;
    }
    let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const entry = { ...job, key, resolve, reject, promise };
    if (job.bg) this.queue.push(entry); else this.queue.unshift(entry);
    this.emit({ type: "queued", key, pending: this.queue.length });
    this.pump();
    return promise;
  }
  // While you're playing nothing renders; the interrupted job goes back to the front of the queue.
  pause() {
    this.playing = true; this.hold = true;
    if (this.proc) { this.abortReason = "paused"; try { this.proc.kill(); } catch {} }
  }
  gameOver() { this.playing = false; this.pump(); } // your own requests can run again; background still waits for resume()
  resume() { this.playing = false; this.hold = false; this.pump(); }
  pending() { return this.queue.length + (this.busy ? 1 : 0); }

  async pump() {
    if (this.busy || this.playing || !this.queue.length) return;
    const i = this.queue.findIndex((j) => !j.bg || !this.hold);
    if (i < 0) return;
    this.busy = true;
    const job = this.queue.splice(i, 1)[0];
    this.emit({ type: "start", key: job.key, pending: this.queue.length });
    try { const out = await this.render(job); job.resolve(out); this.emit({ type: "done", key: job.key, file: out, pending: this.queue.length }); }
    catch (e) {
      if (this.abortReason === "paused") { this.queue.unshift(job); this.emit({ type: "paused", key: job.key, pending: this.queue.length }); }
      else { this.log("[clips] " + e.message); job.reject(e); this.emit({ type: "error", key: job.key, error: e.message, pending: this.queue.length }); }
    }
    this.abortReason = null; this.busy = false; this.pump();
  }

  // ---------- render one clip ----------
  // ---------- rendering ----------
  // Single clips render directly. Whole matches are built from a cache: clips that already exist for the match are
  // reused, the missing parts are recorded in chunks of up to 60 s (each chunk is kept, so a render interrupted by a
  // live game resumes where it stopped), and everything is stitched into one video at the end.
  async render({ replay, gameId, frame, start: jobStart, end: jobEnd }) {
    const c = this.check(); if (!c.ok) throw new Error(c.problems.join(" "));
    await this.ensureFfmpeg();
    if (!replay || !fs.existsSync(replay)) throw new Error("This game's replay file is missing, so no clip can be made.");
    const key = `${gameId}_${frame}`;
    if (frame !== "full") {
      const start = Math.max(-123, jobStart ?? frame - PRE), end = jobEnd ?? frame + POST;
      const out = this.clipPath(gameId, frame);
      await this.renderRange({ c, replay, start, end, out, crf: 22, tag: key, progress: (p, stage) => this.emit({ type: "progress", key, pct: p, stage }) });
      fs.writeFileSync(out.replace(/\.mp4$/, ".json"), JSON.stringify({ gameId, frame, start, end, fps: FPS }));
      return out;
    }
    const start = -123, end = jobEnd, total = end - start + 1;
    const plan = this.planMatch(gameId, start, end);
    this.writeLog([`--- plan ${gameId}: ${plan.map((p) => (p.file ? `cached ${p.a}..${p.b}` : `record ${p.a}..${p.b}`)).join(", ")}`]);
    let doneFrames = 0;
    for (const p of plan) {
      if (!p.file) {
        const name = `r${p.a}_${p.b}`, out = this.clipPath(gameId, name);
        await this.renderRange({ c, replay, start: p.a, end: p.b, out, crf: 18, tag: `${key} part ${p.a}..${p.b}`,
          progress: (pct, stage) => this.emit({ type: "progress", key, pct: Math.min(98, Math.floor((100 * (doneFrames + (pct / 100) * (p.b - p.a + 1))) / total)), stage: stage === "encoding" ? undefined : stage }) });
        fs.writeFileSync(out.replace(/\.mp4$/, ".json"), JSON.stringify({ gameId, frame: name, start: p.a, end: p.b, fps: FPS, part: true }));
        p.file = out; p.fileStart = p.a;
      }
      doneFrames += p.b - p.a + 1;
      this.emit({ type: "progress", key, pct: Math.min(98, Math.floor((100 * doneFrames) / total)) });
    }
    // stitch
    this.emit({ type: "progress", key, pct: 99, stage: "encoding" });
    const out = this.clipPath(gameId, "full"), tmp = out + ".part.mp4";
    const args = ["-y"]; let fv = "";
    plan.forEach((p, i) => {
      args.push("-i", p.file);
      const A = p.a - p.fileStart, B = p.b - p.fileStart + 1;
      fv += `[${i}:v]trim=start_frame=${A}:end_frame=${B},setpts=PTS-STARTPTS[v${i}];[${i}:a]atrim=start=${(A / FPS).toFixed(4)}:end=${(B / FPS).toFixed(4)},asetpts=PTS-STARTPTS[a${i}];`;
    });
    fv += plan.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${plan.length}:v=1:a=1[v][a]`;
    args.push("-filter_complex", fv, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", tmp);
    await run(this.ffmpeg, args);
    fs.renameSync(tmp, out);
    fs.writeFileSync(out.replace(/\.mp4$/, ".json"), JSON.stringify({ gameId, frame: "full", start, end, fps: FPS }));
    // the recorded parts were only scaffolding; event clips stay
    for (const p of plan) if (/_r-?\d+_-?\d+\.mp4$/.test(p.file)) { try { fs.unlinkSync(p.file); fs.unlinkSync(p.file.replace(/\.mp4$/, ".json")); } catch {} }
    return out;
  }

  // Which parts of a match can come from the cache, and which must be recorded.
  planMatch(gameId, start, end) {
    const OVERHEAD = 420; // frames of real time a Dolphin start costs (~7 s), so tiny cached pieces aren't worth a split
    const CHUNK = 3600;   // record at most 60 s per run, so an interruption loses little
    const cached = [];
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.startsWith(gameId + "_") || !f.endsWith(".json") || f.endsWith("_full.json")) continue;
      try { const m = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")); const file = path.join(this.dir, f.replace(/\.json$/, ".mp4"));
        if (Number.isFinite(m.start) && Number.isFinite(m.end) && fs.existsSync(file)) cached.push({ file, fileStart: m.start, a: m.start, b: m.end, part: !!m.part }); } catch {}
    }
    cached.sort((x, y) => x.a - y.a || y.b - x.b);
    const picks = []; let cur = start;
    for (const k of cached) {
      if (k.b < cur) continue;
      const a = Math.max(k.a, cur), b = Math.min(k.b, end);
      if (b - a + 1 < (k.part ? 60 : OVERHEAD)) continue; // keep recorded parts even if short; skip tiny event clips
      picks.push({ ...k, a, b }); cur = b + 1; if (cur > end) break;
    }
    const plan = []; cur = start;
    const addGap = (a, b) => { for (let x = a; x <= b; x += CHUNK) plan.push({ a: x, b: Math.min(b, x + CHUNK - 1) }); };
    for (const p of picks) { if (p.a > cur) addGap(cur, p.a - 1); plan.push(p); cur = p.b + 1; }
    if (cur <= end) addGap(cur, end);
    return plan;
  }

  // Record frames start..end of a replay into an mp4 (always with an audio track, so pieces can be stitched).
  async renderRange({ c, replay, start, end, out, crf, tag, progress }) {
    const fastWanted = !!this.getCfg?.().clipsFast && !this.fastBroken();
    for (const fast of fastWanted ? [true, false] : [false]) {
      this.fastNow = fast;
      const exe = this.prepareDolphin(c.playback);
      const dump = path.join(this.work, "User", "Dump");
      fs.rmSync(path.join(dump, "Frames"), { recursive: true, force: true });
      fs.rmSync(path.join(dump, "Audio"), { recursive: true, force: true });
      const comm = path.join(this.work, "comm.json");
      fs.writeFileSync(comm, JSON.stringify({ mode: "normal", replay, startFrame: start, endFrame: end, isRealTimeMode: false,
        commandId: Math.random().toString(36).slice(2) }));
      const logLines = [`--- ${new Date().toISOString()} ${tag} (${start}..${end})${fast ? " fast" : ""}`, `exe: ${exe}`, `iso: ${c.iso}`, `replay: ${replay}`];
      const t0 = Date.now();
      try { await this.runDolphin({ exe, comm, iso: c.iso, start, end, logLines, progress, fast }); } finally { this.writeLog(logLines); }
      const frames = path.join(dump, "Frames"), audio = path.join(dump, "Audio");
      const vids = fs.existsSync(frames) ? fs.readdirSync(frames).filter((f) => /^framedump\d+\.avi$/.test(f)).sort((a, b) => parseInt(a.slice(9)) - parseInt(b.slice(9))) : [];
      if (!vids.length) { this.writeLog([`no video in ${frames}`]); throw new Error("Dolphin played the replay but didn't record any video."); }
      const wav = fs.existsSync(path.join(audio, "dspdump.wav")) ? path.join(audio, "dspdump.wav") : null;
      if (fast) { // audio and video dumps must agree in length, or this machine can't record unthrottled
        const dv = await probeDuration(this.ffmpeg, path.join(frames, vids[vids.length - 1])), da = wav ? await probeDuration(this.ffmpeg, wav) : dv;
        const ok = vids.length === 1 && dv > 0 && da > 0 && Math.abs(dv - da) / dv < 0.02;
        this.writeLog([`fast check: video ${dv}s audio ${da}s ${ok ? "ok" : "MISMATCH, redoing at normal speed"} (${((Date.now() - t0) / 1000).toFixed(1)}s wall)`]);
        if (!ok) { this.markFastBroken(); continue; }
      }
      const secs = (end - start + 1) / FPS, tmp = out + ".part.mp4";
      // The dump may include frames from fast-forwarding to the start, so keep only the last <secs> seconds of both streams.
      const args = ["-y"];
      if (vids.length === 1) args.push("-sseof", `-${secs.toFixed(3)}`, "-i", path.join(frames, vids[0]));
      else { const list = path.join(frames, "list.txt"); fs.writeFileSync(list, vids.map((v) => `file '${path.join(frames, v).replace(/'/g, "'\\''")}'`).join("\n"));
        args.push("-f", "concat", "-safe", "0", "-sseof", `-${secs.toFixed(3)}`, "-i", list); }
      if (wav) args.push("-sseof", `-${secs.toFixed(3)}`, "-i", wav); else args.push("-f", "lavfi", "-t", secs.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
      args.push("-map", "0:v:0", "-map", "1:a:0");
      progress && progress(99, "encoding");
      args.push("-vf", "fps=60,scale=-2:720:flags=lanczos", "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "160k", "-t", secs.toFixed(3), tmp);
      await run(this.ffmpeg, args);
      fs.renameSync(tmp, out);
      // raw Dolphin dumps are hundreds of MB; only the trimmed mp4 is kept
      fs.rmSync(frames, { recursive: true, force: true }); fs.rmSync(audio, { recursive: true, force: true });
      return out;
    }
    throw new Error("Recording failed.");
  }
  fastBroken() { return fs.existsSync(path.join(this.work || this.dir, "fast-unsupported")); }
  markFastBroken() { try { fs.writeFileSync(path.join(this.work, "fast-unsupported"), new Date().toISOString()); } catch {} this.emit({ type: "fastOff" }); }

  runDolphin({ exe, comm, iso, start, end, logLines, progress }) {
    return new Promise((resolve, reject) => {
      const p = spawn(exe, ["-i", comm, "-b", "-e", iso, "--cout"], { cwd: this.work, windowsHide: true }); this.proc = p;
      let lastPct = -1, lastFrame = null, finished = false, buf = "";
      const t0 = Date.now();
      const done = (err) => { if (finished) return; finished = true; clearTimeout(t); try { p.kill(); } catch {} setTimeout(() => (err ? reject(err) : resolve()), 800); };
      // Fallback if Dolphin never reports frames: stop after a generous wait and use whatever video it recorded.
      const framesDir = path.join(this.work, "User", "Dump", "Frames");
      const hasVideo = () => { try { return fs.readdirSync(framesDir).some((f) => /\.avi$/i.test(f)); } catch { return false; } };
      const t = setTimeout(() => { logLines.push("timeout reached"); done(lastFrame !== null || hasVideo() ? null : new Error("Dolphin took too long to render this clip.")); }, 120000 + ((end - start) / 60) * 2500);
      const onOut = (tag) => (d) => {
        buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop();
        for (const l of lines) {
          const m = l.match(/\[CURRENT_FRAME\]\s*(-?\d+)/);
          if (m) { const first = lastFrame === null; lastFrame = +m[1];
            const pct = Math.max(0, Math.min(99, Math.floor((100 * (lastFrame - start)) / (end - start + 1))));
            if (pct !== lastPct) { lastPct = pct; progress && progress(pct); } if (first || lastFrame % 600 === 0) logLines.push(`${Date.now() - t0}ms ${l.trim()}`); }
          else if (l.trim()) logLines.push(`${Date.now() - t0}ms ${tag} ${l.trim()}`);
          // [PLAYBACK_END_FRAME] is only a header printed at startup (the target end frame), and [NO_GAME] can show up
          // while Dolphin is still booting, so we stop when playback reaches the end frame (or ends after starting).
          if ((lastFrame !== null && lastFrame >= end) || (/\[NO_GAME\]/.test(l) && lastFrame !== null)) done();
        }
      };
      p.stdout.on("data", onOut("out")); p.stderr.on("data", onOut("err"));
      p.on("error", (e) => done(new Error("Couldn't start Slippi Dolphin: " + e.message)));
      p.on("exit", (code, sig) => { this.proc = null;
        if (this.abortReason === "paused") { logLines.push("paused for a live game"); finished || (finished = true, clearTimeout(t), reject(new Error("paused"))); return; }
        logLines.push(`${Date.now() - t0}ms exit code ${code} signal ${sig} lastFrame ${lastFrame}`);
        done(lastFrame === null && !hasVideo() ? new Error(`Slippi Dolphin closed before the replay started (exit code ${code}).`) : null); });
    });
  }

  writeLog(lines) {
    const f = path.join(path.dirname(this.dir), "clip-render.log");
    try { let prev = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""; if (prev.length > 200000) prev = prev.slice(-100000);
      fs.writeFileSync(f, prev + lines.join("\r\n") + "\r\n"); } catch {}
  }

  meta(gameId, frame) { try { return JSON.parse(fs.readFileSync(this.clipPath(gameId, frame).replace(/\.mp4$/, ".json"), "utf8")); } catch { return null; } }

  prune(days) {
    for (const f of fs.readdirSync(this.dir)) if (f.endsWith(".part.mp4")) try { fs.unlinkSync(path.join(this.dir, f)); } catch {}
    if (!days) return;
    const cutoff = Date.now() - days * 864e5;
    for (const f of fs.readdirSync(this.dir)) { const p = path.join(this.dir, f); try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch {} }
  }
}

function fetchBuffer(url, hops = 0) {
  return new Promise((resolve, reject) => {
    require("https").get(url, { headers: { "User-Agent": "MeleeCoach" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) { res.resume(); return resolve(fetchBuffer(new URL(res.headers.location, url).href, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Couldn't download ffmpeg (HTTP ${res.statusCode}).`)); }
      const chunks = []; res.on("data", (d) => chunks.push(d)); res.on("end", () => resolve(Buffer.concat(chunks))); res.on("error", reject);
    }).on("error", (e) => reject(new Error("Couldn't download ffmpeg: " + e.message)));
  });
}

// Duration in seconds from ffmpeg's banner (ffmpeg exits non-zero with only an input; that's expected).
function probeDuration(bin, file) {
  return new Promise((resolve) => {
    const p = spawn(bin, ["-hide_banner", "-i", file], { windowsHide: true }); let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", () => resolve(0));
    p.on("exit", () => { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(err); resolve(m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0); });
  });
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true }); let err = "";
    p.stderr.on("data", (d) => { err = (err + d).slice(-4000); });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg failed: " + err.split("\n").slice(-4).join(" ")))));
  });
}

// Minimal INI editor that keeps every other line as it was.
function setIni(file, sections) {
  let lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  for (const [sec, kv] of Object.entries(sections)) {
    let si = lines.findIndex((l) => l.trim().toLowerCase() === `[${sec.toLowerCase()}]`);
    if (si < 0) { lines.push(`[${sec}]`); si = lines.length - 1; }
    let ei = si + 1; while (ei < lines.length && !/^\s*\[/.test(lines[ei])) ei++;
    for (const [k, v] of Object.entries(kv)) {
      const idx = lines.slice(si + 1, ei).findIndex((l) => l.split("=")[0].trim().toLowerCase() === k.toLowerCase());
      if (idx >= 0) lines[si + 1 + idx] = `${k} = ${v}`; else { lines.splice(ei, 0, `${k} = ${v}`); ei++; }
    }
  }
  fs.writeFileSync(file, lines.join("\r\n"));
}

module.exports = { ClipRenderer, PRE, POST, FPS, setIni };
