const CopilotClient = {
  async plan(prompt, context) {
    const base = ApiKeys.getServiceUrl().replace(/\/$/, "");
    const response = await fetch(base + "/copilot/plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context, model: ApiKeys.getOllamaModel() })
    });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { throw new Error("استجابة الخدمة غير صالحة"); }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
};
