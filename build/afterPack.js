// Drop Electron files this app never uses (WebGPU shader compiler).
const fs = require("fs"), path = require("path");
exports.default = async (ctx) => { for (const f of ["dxcompiler.dll", "dxil.dll"]) fs.rmSync(path.join(ctx.appOutDir, f), { force: true }); };
