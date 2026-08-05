function normalizeText(value) { return String(value || "").trim(); }
function buildMessages(config, history) {
  const system = [config.business.context, config.business.instructions].map(normalizeText).filter(Boolean).join("\n\n");
  const messages = history.filter((item) => normalizeText(item.text)).map((item) => ({ role: item.outgoing ? "assistant" : "user", content: normalizeText(item.text) }));
  return system ? [{ role: "system", content: system }, ...messages] : messages;
}
module.exports = { buildMessages };
