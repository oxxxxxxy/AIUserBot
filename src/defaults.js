const DEFAULT_CONFIG = Object.freeze({
  telegram: { apiId: "", apiHash: "", phone: "", session: "" },
  llm: { baseUrl: "http://127.0.0.1:20128/v1", apiKey: "sk-65d93558abc78ebf-7db9ef-4c9b0376", model: "ds-web/deepseek-chat", temperature: 0.4, maxTokens: 500 },
  business: { context: "", instructions: "" },
  automation: { enabled: false, replyDelaySeconds: 4, historyLimit: 12, manualPauseEnabled: true, manualPauseMinutes: 30 },
  chats: { mode: "allow", selectedIds: [], knownIds: [], allowNewChats: true, historyAll: false, historyLimit: 12, maxContextChars: 60000 },
});
module.exports = { DEFAULT_CONFIG };
