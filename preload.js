const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("coach", {
  games: () => ipcRenderer.invoke("games"),
  r2Data: () => ipcRenderer.invoke("r2Data"),
  r2Hide: (id) => ipcRenderer.invoke("r2Hide", id),
  obsStatus: () => ipcRenderer.invoke("obsStatus"),
  charArt: (char, index) => ipcRenderer.invoke("charArt", { char, index }),
  checkUpdate: () => ipcRenderer.invoke("checkUpdate"),
  openExternal: (u) => ipcRenderer.invoke("openExternal", u),
  obsSaveNow: () => ipcRenderer.invoke("obsSaveNow"),
  clipUrl: (f) => ipcRenderer.invoke("clipUrl", f),
  game: (id) => ipcRenderer.invoke("game", id),
  config: () => ipcRenderer.invoke("config"),
  status: () => ipcRenderer.invoke("status"),
  setConfig: (patch) => ipcRenderer.invoke("setConfig", patch),
  pickFolder: () => ipcRenderer.invoke("pickFolder"),
  import: (opts) => ipcRenderer.invoke("import", opts),
  openReplay: (file) => ipcRenderer.invoke("openReplay", file),
  clipInfo: (q) => ipcRenderer.invoke("clipInfo", q),
  renderClip: (q) => ipcRenderer.invoke("renderClip", q),
  clipCheck: () => ipcRenderer.invoke("clipCheck"),
  openClips: () => ipcRenderer.invoke("openClips"),
  clipQueue: () => ipcRenderer.invoke("clipQueue"),
  inputs: (q) => ipcRenderer.invoke("inputs", q),
  restartApp: () => ipcRenderer.invoke("restartApp"),
  pendingUpdate: () => ipcRenderer.invoke("pendingUpdate"),
  justUpdated: () => ipcRenderer.invoke("justUpdated"),
  on: (channel, fn) => {
    const ok = ["status", "live", "gameStart", "gameEnd", "games", "import", "cue", "say", "config", "clip", "update", "r2", "recap", "goto", "obs"];
    if (ok.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
