function normalizeText(value) { return String(value || "").trim(); }
function buildMessages(config, history) {
  const system = [config.business.context, config.business.instructions].map(normalizeText).filter(Boolean).join("\n\n");
  const messages = history.filter((item) => normalizeText(item.text)).map((item) => ({ role: item.outgoing ? "assistant" : "user", content: normalizeText(item.text) }));
  if (String(config.llm?.model || "").startsWith("ds-web/") && messages.length) {
    const transcript = `${messages.map((item) => `${item.role === "assistant" ? "Ассистент" : "Пользователь"}: ${item.content}`).join("\n")}\nАссистент:`;
    return [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: transcript }];
  }
  return system ? [{ role: "system", content: system }, ...messages] : messages;
}
module.exports = { buildMessages };
