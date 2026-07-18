const ApiKeys = {
  STORAGE_KEY: "idurazi_ai_settings_v3_local_service",
  save(serviceUrl, ollamaModel, whisperKey) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
      serviceUrl: (serviceUrl || "http://127.0.0.1:37841").replace(/\/$/, ""),
      ollamaModel: ollamaModel || "qwen3:8b",
      whisper: whisperKey || ""
    }));
  },
  load() {
    const fallback = { serviceUrl: "http://127.0.0.1:37841", ollamaModel: "qwen3:8b", whisper: "" };
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? Object.assign({}, fallback, JSON.parse(raw)) : fallback;
    } catch (_) { return fallback; }
  },
  getServiceUrl() { return this.load().serviceUrl; },
  getOllamaModel() { return this.load().ollamaModel; },
  getWhisperKey() { return this.load().whisper; }
};
