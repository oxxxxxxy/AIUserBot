const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_CONFIG } = require("./defaults");
const LEGACY_GENERATED_INSTRUCTIONS = "Отвечай от имени компании кратко, вежливо и по существу. Не выдумывай факты. Если информации недостаточно, скажи, что менеджер уточнит детали.";

function mergeConfig(value = {}) {
  const config = {
    telegram: { ...DEFAULT_CONFIG.telegram, ...(value.telegram || {}) },
    llm: { ...DEFAULT_CONFIG.llm, ...(value.llm || {}) },
    business: { ...DEFAULT_CONFIG.business, ...(value.business || {}) },
    automation: { ...DEFAULT_CONFIG.automation, ...(value.automation || {}) },
    chats: { ...DEFAULT_CONFIG.chats, ...(value.chats || {}) },
  };
  if (config.business.instructions === LEGACY_GENERATED_INSTRUCTIONS) config.business.instructions = "";
  return config;
}
class ConfigStore {
  constructor(directory) { this.file = path.join(directory, "config.json"); fs.mkdirSync(directory, { recursive: true }); }
  load() {
    try { return mergeConfig(JSON.parse(fs.readFileSync(this.file, "utf8"))); }
    catch (error) { if (error.code !== "ENOENT" && error.name !== "SyntaxError") throw error; return mergeConfig(); }
  }
  save(value) {
    const config = mergeConfig(value); const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(config, null, 2), { mode: 0o600 }); fs.renameSync(temporary, this.file); return config;
  }
}
module.exports = { ConfigStore, mergeConfig };
