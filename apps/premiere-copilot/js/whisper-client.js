const WhisperClient = {
  API_URL: "https://api.openai.com/v1/audio/transcriptions",
  async transcribe(uxpFile) {
    const apiKey = ApiKeys.getWhisperKey();
    if (!apiKey) throw new Error("أدخل مفتاح OpenAI API في الإعدادات.");
    if (!uxpFile) throw new Error("اختر ملفًا أولًا.");
    const { formats } = require("uxp").storage;
    const bytes = await uxpFile.read({ format: formats.binary });
    const blob = new Blob([bytes], { type: this._mimeFor(uxpFile.name) });
    const form = new FormData();
    form.append("file", blob, uxpFile.name);
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    form.append("language", "ar");
    const response = await fetch(this.API_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    if (!response.ok) throw new Error(`OpenAI API (${response.status}): ${await response.text()}`);
    return this._formatWithTimestamps(await response.json());
  },
  _mimeFor(name) {
    const ext = String(name).split(".").pop().toLowerCase();
    return ({ mp3:"audio/mpeg", wav:"audio/wav", m4a:"audio/mp4", mp4:"video/mp4", mov:"video/quicktime", webm:"audio/webm", ogg:"audio/ogg" })[ext] || "application/octet-stream";
  },
  _formatWithTimestamps(data) {
    if (!data.segments || !data.segments.length) return data.text || "";
    return data.segments.map(seg => {
      const m = Math.floor(seg.start / 60).toString().padStart(2, "0");
      const s = Math.floor(seg.start % 60).toString().padStart(2, "0");
      return `[${m}:${s}] ${String(seg.text || "").trim()}`;
    }).join("\n");
  }
};
