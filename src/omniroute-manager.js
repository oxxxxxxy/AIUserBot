const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { app } = require("electron");

class OmniRouteManager {
  constructor({ dataDir, emit, port = 20128 }) {
    this.dataDir = dataDir;
    this.emit = emit;
    this.port = port;
    this.logFile = path.join(dataDir, "omniroute.log");
    this.process = null;
    this.owned = false;
  }

  get dashboardUrl() { return `http://127.0.0.1:${this.port}`; }
  get apiUrl() { return `${this.dashboardUrl}/v1`; }

  async probe() {
    try {
      const response = await fetch(`${this.dashboardUrl}/`, { redirect: "manual", signal: AbortSignal.timeout(1500) });
      return response.status >= 200 && response.status < 500;
    } catch { return false; }
  }

  async status() { return { running: await this.probe(), owned: this.owned, dashboardUrl: this.dashboardUrl, apiUrl: this.apiUrl }; }

  async start() {
    if (await this.probe()) {
      this.emit("omniroute-status", await this.status());
      return this.status();
    }
    const cli = app.isPackaged ? path.join(process.resourcesPath, "omniroute-runner.cjs") : require.resolve("omniroute/bin/omniroute.mjs");
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.appendFileSync(this.logFile, `\n[${new Date().toISOString()}] Starting ${cli}\n`);
    this.process = spawn(process.execPath, [cli, "serve", "--no-open", "--no-tray", "--port", String(this.port)], {
      cwd: path.dirname(cli),
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", DATA_DIR: this.dataDir, PORT: String(this.port), DASHBOARD_PORT: String(this.port), API_PORT: String(this.port), OMNIROUTE_NO_UPDATE_NOTIFIER: "1", OMNIROUTE_CLI_SKIP_REPO_ENV: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.owned = true;
    const log = (data) => {
      const text = String(data).replace(/\x1b\[[0-9;]*m/g, "").trim();
      if (text) fs.appendFileSync(this.logFile, `${text}\n`);
      if (text) this.emit("log", { level: "info", message: `OmniRoute: ${text.split("\n").at(-1)}` });
    };
    this.process.stdout.on("data", log); this.process.stderr.on("data", log);
    this.process.on("error", (error) => {
      fs.appendFileSync(this.logFile, `Spawn error: ${error.stack || error.message}\n`);
      this.emit("log", { level: "error", message: `Не удалось запустить встроенный OmniRoute: ${error.message}. Журнал: ${this.logFile}` });
      this.process = null; this.owned = false;
    });
    this.process.on("exit", (code) => { this.process = null; this.owned = false; this.emit("omniroute-status", { running: false, owned: false, dashboardUrl: this.dashboardUrl, apiUrl: this.apiUrl }); if (code) this.emit("log", { level: "error", message: `OmniRoute остановлен с кодом ${code}` }); });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (await this.probe()) { const state = await this.status(); this.emit("omniroute-status", state); this.emit("log", { level: "success", message: "Встроенный OmniRoute запущен" }); return state; }
      if (!this.process) break;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error(`Встроенный OmniRoute не запустился. Журнал: ${this.logFile}`);
  }

  async stop() {
    if (this.process && this.owned) {
      this.process.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (this.process) this.process.kill("SIGKILL");
    }
    this.process = null; this.owned = false;
  }
}
module.exports = { OmniRouteManager };
