// Builds dist/app-<version>.mcupd: the app's own files as gzipped JSON, attached to a GitHub release.
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const files = {};
const add = (rel) => { const p = path.join(root, rel); if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p)) add(path.join(rel, f)); return; } files[rel.split(path.sep).join("/")] = fs.readFileSync(p).toString("base64"); };
["main.js", "preload.js", "engine", "ui"].forEach(add);
// the installed package.json only needs these fields
files["package.json"] = Buffer.from(JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, notes: pkg.notes || [], main: "main.js", dependencies: pkg.dependencies }, null, 2)).toString("base64");
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", `app-${pkg.version}.mcupd`);
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({ version: pkg.version, files })));
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + " KB", Object.keys(files).length + " files");
