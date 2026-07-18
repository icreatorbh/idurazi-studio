const OllamaClient = {
  async request(path, options = {}) {
    const baseUrl = ApiKeys.getServiceUrl().replace(/\/$/, "");
    let response;
    try { response = await fetch(baseUrl + path, options); }
    catch (_) { throw new Error("تعذر الاتصال بخدمة iDurazi المحلية: " + baseUrl); }
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) throw new Error(data.error || `Local service (${response.status}): ${text || response.statusText}`);
    return data;
  },
  async testConnection() { return this.request("/health", { method: "GET" }); },
  async analyzeAndSuggest(transcript, availableGraphics) {
    const model = ApiKeys.getOllamaModel();
    if (!model) throw new Error("اختر نموذج Ollama في الإعدادات.");
    const data = await this.request("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, availableGraphics, model })
    });
    if (!Array.isArray(data.suggestions)) throw new Error("الخدمة لم ترجع suggestions صحيحة.");
    return data;
  }
};
