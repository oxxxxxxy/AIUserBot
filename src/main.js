const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { ConfigStore } = require("./config-store");
const { TelegramService } = require("./telegram-service");
const { buildMessages } = require("./prompt");
const { requestCompletion } = require("./llm-client");
const { OmniRouteManager } = require("./omniroute-manager");
let mainWindow, store, config, telegram, omniroute;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
});
function emit(type, data) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("app:event", { type, data }); }
function safeConfig(value) { return { ...value, telegram: { ...value.telegram, session: value.telegram.session ? "__saved__" : "" } }; }
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1080, height: 760, minWidth: 860, minHeight: 620, backgroundColor: "#0b1016", title: "AI UserBot", webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.removeMenu(); mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}
app.whenReady().then(() => {
  store = new ConfigStore(app.getPath("userData")); config = store.load();
  omniroute = new OmniRouteManager({ dataDir: path.join(app.getPath("userData"), "omniroute"), emit });
  if (config.llm.baseUrl === "http://127.0.0.1:20128/v1" || config.llm.baseUrl === "http://localhost:20128/v1") {
    config.llm.baseUrl = omniroute.apiUrl; config = store.save(config);
  }
  telegram = new TelegramService({ getConfig: () => config, saveConfig: (next) => { config = store.save(next); }, emit });
  ipcMain.handle("state:get", () => ({ config: safeConfig(config), status: telegram.status() }));
  ipcMain.handle("config:save", (_event, next) => { const session = config.telegram.session; config = store.save({ ...next, telegram: { ...next.telegram, session } }); emit("log", { level: "success", message: "Настройки сохранены" }); return safeConfig(config); });
  ipcMain.handle("telegram:connect", () => telegram.connect()); ipcMain.handle("telegram:disconnect", () => telegram.disconnect()); ipcMain.handle("telegram:logout", () => telegram.logout());
  ipcMain.handle("telegram:load-chats", () => telegram.loadChats());
  ipcMain.handle("telegram:auth-submit", (_event, value) => telegram.submitAuthInput(value));
  ipcMain.handle("llm:test", () => requestCompletion(config.llm, buildMessages(config, [{ outgoing: false, text: "Поздоровайся с клиентом одним коротким предложением." }])));
  ipcMain.handle("omniroute:status", () => omniroute.status());
  ipcMain.handle("omniroute:start", () => omniroute.start());
  ipcMain.handle("omniroute:open-dashboard", async () => { await omniroute.start(); await shell.openExternal(omniroute.dashboardUrl); return omniroute.status(); });
  createWindow();
  omniroute.start().catch((error) => emit("log", { level: "error", message: error.message }));
});
app.on("window-all-closed", async () => { if (telegram) await telegram.disconnect().catch(() => {}); if (omniroute) await omniroute.stop().catch(() => {}); app.quit(); });
