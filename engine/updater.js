// In-app updates from GitHub Releases. A release carries a small "app-<version>.mcupd" asset: the app's own
// files (main.js, preload.js, engine/, ui/, package.json) as gzipped JSON. They're written over the installed
// copy; the folder watcher then shows the usual "Update ready" pop-up. A release that needs a new Electron
// (or new node modules) also carries a full installer and says so in its notes.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const https = require("https");

function get(url, json = true, hops = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "MeleeCoach", Accept: json ? "application/vnd.github+json" : "application/octet-stream" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) { res.resume(); return resolve(get(res.headers.location, json, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`GitHub answered ${res.statusCode}`)); }
      const chunks = []; res.on("data", (d) => chunks.push(d));
      res.on("end", () => { const b = Buffer.concat(chunks); try { resolve(json ? JSON.parse(b.toString("utf8")) : b); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}
const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

async function checkAndApply({ repo, current, appDir, log = () => {} }) {
  if (!repo) return { state: "off" };
  // 1) updates/latest.json on the main branch (pushing is enough to publish)
  let man = null;
  try { man = await get(`https://raw.githubusercontent.com/${repo}/main/updates/latest.json?t=${Date.now()}`); } catch {}
  if (man && man.version) {
    if (!newer(man.version, current)) return { state: "current", version: current };
    if (man.installer) return { state: "installer", version: man.version, url: `https://github.com/${repo}/releases` };
    const pack = JSON.parse(zlib.gunzipSync(await get(`https://raw.githubusercontent.com/${repo}/main/${man.file}`, false)).toString("utf8"));
    if (pack.version !== man.version || !pack.files) throw new Error("Update package looks wrong.");
    applyPack(pack, appDir); log(`[update] applied ${man.version}`);
    return { state: "applied", version: man.version };
  }
  // 2) GitHub releases
  const rel = await get(`https://api.github.com/repos/${repo}/releases/latest`);
  const ver = String(rel.tag_name || "").replace(/^v/, "");
  if (!ver || !newer(ver, current)) return { state: "current", version: current };
  const asset = (rel.assets || []).find((a) => a.name === `app-${ver}.mcupd`);
  if (!asset) return { state: "installer", version: ver, url: rel.html_url }; // needs the full installer
  const pack = JSON.parse(zlib.gunzipSync(await get(asset.browser_download_url, false)).toString("utf8"));
  if (pack.version !== ver || !pack.files) throw new Error("Update package looks wrong.");
  applyPack(pack, appDir); log(`[update] applied ${ver}`);
  return { state: "applied", version: ver };
}
function applyPack(pack, appDir) {
  // write everything except package.json first; package.json last signals "update finished" to the watcher
  const entries = Object.entries(pack.files).sort(([a], [b]) => (a === "package.json") - (b === "package.json"));
  for (const [rel, b64] of entries) {
    if (rel.includes("..") || path.isAbsolute(rel)) continue;
    const dst = path.join(appDir, rel); fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst + ".new", Buffer.from(b64, "base64")); fs.renameSync(dst + ".new", dst);
  }
  return entries.length;
}

module.exports = { checkAndApply, applyPack, newer };
