// Runs replay analysis off the main thread.
const { parentPort, workerData } = require("worker_threads");
const { analyzeFile } = require("./feed");
const cfg = workerData.cfg;
for (const f of workerData.files) {
  let g = null; try { g = analyzeFile(f, () => cfg); } catch {}
  parentPort.postMessage({ file: f, game: g });
}
parentPort.postMessage({ done: true });
