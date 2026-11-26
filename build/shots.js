// Dev-only: capture screenshots of each view, then quit.
const fs = require("fs"); const path = require("path");
module.exports = (win, dir) => {
  win.webContents.once("did-finish-load", async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(2500); win.show();
    const views = (process.env.MC_VIEWS || "home,games,review,progress,settings").split(",");
    for (const v of views) {
      if (v.startsWith("js:")) { const i = v.indexOf("::"); const name = v.slice(3, i), code = v.slice(i + 2); await win.webContents.executeJavaScript(code); await wait(2500); fs.writeFileSync(path.join(dir, name + ".png"), (await win.webContents.capturePage()).toPNG()); continue; }
      if (v.startsWith("moment:")) { const k = v.slice(7); await win.webContents.executeJavaScript(`(()=>{const m=games.flatMap(g=>g.moments||[]).find(x=>x.gameId+"_"+x.frame===${JSON.stringify(k)}); go("review",{momentKey:m.gameId+"|"+m.frame+"|"+m.type, session: sessions(games).find(s=>s.games.some(g=>g.id===m.gameId)).start})})()`); await wait(1800); fs.writeFileSync(path.join(dir, "moment.png"), (await win.webContents.capturePage()).toPNG()); continue; }
      await win.webContents.executeJavaScript(`go(${JSON.stringify(v)})`); await wait(900);
      const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, v + ".png"), img.toPNG());
    }
    if (process.env.MC_JS) { await win.webContents.executeJavaScript(process.env.MC_JS); await wait(3500); fs.writeFileSync(path.join(dir, "js.png"), (await win.webContents.capturePage()).toPNG()); }
    const errs = await win.webContents.executeJavaScript("window.__errs||[]");
    fs.writeFileSync(path.join(dir, "errors.json"), JSON.stringify(errs));
    require("electron").app.exit(0);
  });
};
