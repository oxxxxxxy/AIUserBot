const { TelegramClient } = require("teleproto");
const { StringSession } = require("teleproto/sessions");
const { NewMessage } = require("teleproto/events");
const { Api } = require("teleproto/tl");
const { buildMessages } = require("./prompt");
const { requestCompletion } = require("./llm-client");

class TelegramService {
  constructor({ getConfig, saveConfig, emit }) {
    Object.assign(this, { getConfig, saveConfig, emit });
    this.client = null; this.authInput = null; this.pendingReplies = new Map(); this.manualPauses = new Map(); this.sendingPeers = new Set(); this.connected = false;
  }
  status(extra = {}) { return { connected: this.connected, ...extra }; }
  waitForAuthInput(type, message) {
    this.emit("auth-request", { type, message });
    return new Promise((resolve) => { this.authInput = { resolve }; });
  }
  submitAuthInput(value) {
    if (!this.authInput) throw new Error("Сейчас данные авторизации не запрашиваются");
    const pending = this.authInput; this.authInput = null; pending.resolve(String(value || "").trim());
  }
  async connect() {
    if (this.connected) return this.status();
    const config = this.getConfig(); const apiId = Number(config.telegram.apiId);
    if (!Number.isInteger(apiId) || !config.telegram.apiHash || !config.telegram.phone) throw new Error("Заполни Telegram API ID, API Hash и номер телефона");
    this.client = new TelegramClient(new StringSession(config.telegram.session || ""), apiId, config.telegram.apiHash, { connectionRetries: 5 });
    await this.client.start({
      phoneNumber: async () => config.telegram.phone,
      phoneCode: async () => this.waitForAuthInput("code", "Введи код, присланный Telegram"),
      password: async () => this.waitForAuthInput("password", "Введи пароль двухэтапной аутентификации"),
      onError: (error) => this.emit("log", { level: "error", message: `Авторизация: ${error.message}` }),
    });
    this.connected = true; config.telegram.session = this.client.session.save(); this.saveConfig(config);
    this.client.addEventHandler((event) => this.onMessage(event), new NewMessage({}));
    const me = await this.client.getMe(); const displayName = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.username || String(me.id);
    this.emit("status", this.status({ displayName })); this.emit("log", { level: "success", message: `Telegram подключён: ${displayName}` });
    return this.status({ displayName });
  }
  async disconnect() {
    for (const timer of this.pendingReplies.values()) clearTimeout(timer); this.pendingReplies.clear();
    if (this.client) await this.client.disconnect(); this.client = null; this.connected = false; this.emit("status", this.status()); return this.status();
  }
  async logout() {
    if (this.client && this.connected) await this.client.invoke(new Api.auth.LogOut());
    await this.disconnect(); const config = this.getConfig(); config.telegram.session = ""; this.saveConfig(config);
  }
  async onMessage(event) {
    const message = event.message;
    if (!message?.peerId || !message.isPrivate) return;
    const peerKey = String(message.chatId || message.senderId || ""); if (!peerKey) return;
    if (message.out) {
      if (!this.sendingPeers.has(peerKey)) {
        const minutes = Number(this.getConfig().automation.manualPauseMinutes) || 30;
        this.manualPauses.set(peerKey, Date.now() + minutes * 60_000);
        this.emit("log", { level: "info", message: `Диалог ${peerKey}: пауза после ручного ответа` });
      }
      return;
    }
    const config = this.getConfig();
    if (!config.automation.enabled || !String(message.message || "").trim() || (this.manualPauses.get(peerKey) || 0) > Date.now()) return;
    clearTimeout(this.pendingReplies.get(peerKey));
    const delay = Math.max(0, Number(config.automation.replyDelaySeconds) || 0) * 1000;
    this.pendingReplies.set(peerKey, setTimeout(() => this.replyToPeer(message.peerId, peerKey), delay));
    this.emit("log", { level: "info", message: `Новое сообщение ${peerKey}; ответ через ${delay / 1000} сек.` });
  }
  async replyToPeer(peer, peerKey) {
    this.pendingReplies.delete(peerKey);
    try {
      const config = this.getConfig();
      if (!config.automation.enabled || (this.manualPauses.get(peerKey) || 0) > Date.now()) return;
      const items = await this.client.getMessages(peer, { limit: Number(config.automation.historyLimit) || 12 });
      const history = [...items].reverse().map((item) => ({ text: item.message, outgoing: Boolean(item.out) }));
      const answer = await requestCompletion(config.llm, buildMessages(config, history)); if (!answer) return;
      this.sendingPeers.add(peerKey); await this.client.sendMessage(peer, { message: answer }); setTimeout(() => this.sendingPeers.delete(peerKey), 2000);
      this.emit("log", { level: "success", message: `Автоответ отправлен в диалог ${peerKey}` });
    } catch (error) {
      this.sendingPeers.delete(peerKey); this.emit("log", { level: "error", message: `Не удалось ответить ${peerKey}: ${error.message}` });
    }
  }
}
module.exports = { TelegramService };
