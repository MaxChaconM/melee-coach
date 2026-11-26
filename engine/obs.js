// Minimal obs-websocket v5 client (built into OBS 28+): connect, authenticate, save the replay buffer.
const crypto = require("crypto");

const sha256b64 = (s) => crypto.createHash("sha256").update(s).digest("base64");

class Obs {
  constructor({ getCfg, log = () => {} }) { this.getCfg = getCfg; this.log = log; this.ws = null; this.ready = null; this.pending = new Map(); this.waiters = []; }
  cfg() { const c = this.getCfg().obs || {}; return { host: c.host || "127.0.0.1", port: c.port || 4455, password: c.password || "" }; }
  connect() {
    if (this.ready) return this.ready;
    const { host, port, password } = this.cfg();
    this.ready = new Promise((resolve, reject) => {
      let ws; try { ws = new WebSocket(`ws://${host}:${port}`); } catch (e) { this.ready = null; return reject(new Error("Couldn't reach OBS: " + e.message)); }
      this.ws = ws; let done = false;
      const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); } this.ready = null; this.ws = null; };
      const t = setTimeout(() => { try { ws.close(); } catch {} fail("OBS didn't answer. Is OBS open, with the WebSocket server turned on (Tools → WebSocket Server Settings)?"); }, 5000);
      ws.onerror = () => { clearTimeout(t); fail("Couldn't connect to OBS. Open OBS and turn on Tools → WebSocket Server Settings → Enable WebSocket server."); };
      ws.onclose = (e) => { clearTimeout(t); if (e.code === 4009) fail("OBS rejected the password. Check it in Melee Coach Settings → OBS."); else fail("OBS closed the connection."); };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.op === 0) { // Hello
          const d = { rpcVersion: 1, eventSubscriptions: 64 }; // Outputs events (ReplayBufferSaved)
          if (m.d.authentication) {
            if (!password) { clearTimeout(t); try { ws.close(); } catch {} return fail("OBS asks for a password. Enter it in Melee Coach Settings → OBS."); }
            const { challenge, salt } = m.d.authentication;
            d.authentication = sha256b64(sha256b64(password + salt) + challenge);
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (m.op === 2) { clearTimeout(t); done = true; resolve(); } // Identified
        else if (m.op === 7) { const p = this.pending.get(m.d.requestId); if (p) { this.pending.delete(m.d.requestId); m.d.requestStatus.result ? p.resolve(m.d.responseData || {}) : p.reject(new Error(m.d.requestStatus.comment || `OBS: ${m.d.requestType} failed`)); } }
        else if (m.op === 5 && m.d.eventType === "ReplayBufferSaved") { const w = this.waiters.shift(); if (w) w(m.d.eventData.savedReplayPath); }
      };
    });
    return this.ready;
  }
  async request(requestType, requestData) {
    await this.connect();
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => { if (this.pending.delete(requestId)) reject(new Error("OBS didn't respond.")); }, 8000);
    });
  }
  async status() {
    try { await this.connect(); const v = await this.request("GetVersion"); const rb = await this.request("GetReplayBufferStatus").catch(() => ({ outputActive: false }));
      return { ok: true, version: v.obsVersion, replayBuffer: !!rb.outputActive }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  // Saves the last N seconds (OBS's replay buffer length). Starts the buffer if it's off (that first save will be short).
  async saveReplay() {
    const st = await this.request("GetReplayBufferStatus");
    if (!st.outputActive) { await this.request("StartReplayBuffer"); throw new Error("OBS's replay buffer was off; it's on now, so the next game will be saved."); }
    const saved = new Promise((resolve) => { this.waiters.push(resolve); setTimeout(() => resolve(null), 15000); });
    await this.request("SaveReplayBuffer");
    return (await saved) || (await this.request("GetLastReplayBufferReplay").then((r) => r.savedReplayPath).catch(() => null));
  }
}

module.exports = { Obs };
