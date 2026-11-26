// Bundles the app into stage/ (no node_modules), then electron-builder packages stage/.
const fs = require("fs"), path = require("path"), esbuild = require("esbuild");
const root = path.join(__dirname, ".."), out = path.join(root, "stage");
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
const common = { bundle: true, platform: "node", target: "node20", external: ["electron"], minify: true, legalComments: "none", logLevel: "warning" };
esbuild.buildSync({ ...common, entryPoints: [path.join(root, "main.js")], outfile: path.join(out, "main.js") });
esbuild.buildSync({ ...common, entryPoints: [path.join(root, "engine", "importWorker.js")], outfile: path.join(out, "importWorker.js") });
fs.copyFileSync(path.join(root, "preload.js"), path.join(out, "preload.js"));
fs.cpSync(path.join(root, "ui"), path.join(out, "ui"), { recursive: true });
fs.mkdirSync(path.join(out, "build")); fs.copyFileSync(path.join(root, "build", "icon.png"), path.join(out, "build", "icon.png"));
const pkg = require(path.join(root, "package.json"));
fs.writeFileSync(path.join(out, "package.json"), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: "main.js", description: pkg.description || "Melee Coach", author: pkg.author || "Max Chacon", dependencies: {} }, null, 2));
console.log("staged", pkg.version);
