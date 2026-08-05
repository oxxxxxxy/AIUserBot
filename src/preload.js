const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("aiUserBot", {
  getState: () => ipcRenderer.invoke("state:get"), saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  connect: () => ipcRenderer.invoke("telegram:connect"), disconnect: () => ipcRenderer.invoke("telegram:disconnect"), logout: () => ipcRenderer.invoke("telegram:logout"),
  submitAuth: (value) => ipcRenderer.invoke("telegram:auth-submit", value), testLlm: () => ipcRenderer.invoke("llm:test"),
  onEvent: (callback) => ipcRenderer.on("app:event", (_event, payload) => callback(payload)),
});
