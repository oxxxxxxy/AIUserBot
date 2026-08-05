function parseSse(text) {
  let result = "";
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    try { result += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ""; } catch {}
  }
  return result.trim();
}
async function requestCompletion(config, messages, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ model: config.model, messages, temperature: Number(config.temperature), max_tokens: Number(config.maxTokens), stream: false }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`OmniRoute ${response.status}: ${body.slice(0, 300)}`);
  if ((response.headers.get("content-type") || "").includes("text/event-stream") || body.startsWith("data:")) return parseSse(body);
  const content = JSON.parse(body).choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Модель вернула пустой ответ");
  return content;
}
module.exports = { requestCompletion, parseSse };
