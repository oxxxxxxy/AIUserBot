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
  async loadChats() {
    if (!this.connected || !this.client) throw new Error("Сначала подключи Telegram");
    const dialogs = await this.client.getDialogs({ limit: 250 });
    const chats = dialogs.filter((dialog) => dialog.isUser && !dialog.entity?.self).map((dialog) => ({
      id: String(dialog.id),
      title: dialog.title || [dialog.entity?.firstName, dialog.entity?.lastName].filter(Boolean).join(" ") || dialog.entity?.username || String(dialog.id),
      username: dialog.entity?.username || "",
    }));
    const config = this.getConfig();
    config.chats.knownIds = [...new Set([...(config.chats.knownIds || []), ...chats.map((chat) => chat.id)])];
    this.saveConfig(config);
    return chats;
  }
  isChatAllowed(peerKey, config) {
    const selected = new Set((config.chats.selectedIds || []).map(String));
    const known = new Set((config.chats.knownIds || []).map(String));
    if (!known.has(peerKey)) return Boolean(config.chats.allowNewChats);
    return config.chats.mode === "deny" ? !selected.has(peerKey) : selected.has(peerKey);
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
    if (!config.automation.enabled || !this.isChatAllowed(peerKey, config) || !String(message.message || "").trim() || (this.manualPauses.get(peerKey) || 0) > Date.now()) return;
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
      const limit = config.chats.historyAll ? 500 : Math.max(1, Number(config.chats.historyLimit) || 12);
      const items = await this.client.getMessages(peer, { limit });
      let history = [...items].reverse().map((item) => ({ text: item.message, outgoing: Boolean(item.out) }));
      const maxChars = Number(config.chats.maxContextChars) || 60000;
      let used = 0; const bounded = [];
      for (let index = history.length - 1; index >= 0; index -= 1) { const size = String(history[index].text || "").length; if (bounded.length && used + size > maxChars) break; bounded.unshift(history[index]); used += size; }
      history = bounded;
      const answer = await requestCompletion(config.llm, buildMessages(config, history)); if (!answer) return;
      this.sendingPeers.add(peerKey); await this.client.sendMessage(peer, { message: answer }); setTimeout(() => this.sendingPeers.delete(peerKey), 2000);
      this.emit("log", { level: "success", message: `Автоответ отправлен в диалог ${peerKey}` });
    } catch (error) {
      this.sendingPeers.delete(peerKey); this.emit("log", { level: "error", message: `Не удалось ответить ${peerKey}: ${error.message}` });
    }
  }
}
module.exports = { TelegramService };
