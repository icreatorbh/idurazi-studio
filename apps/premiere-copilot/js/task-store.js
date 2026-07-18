const TaskStore = {
  KEY: "idurazi_copilot_tasks_v1",
  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); } catch (_) { return []; } },
  save(tasks) { localStorage.setItem(this.KEY, JSON.stringify(tasks.slice(0, 200))); },
  addMany(items, meta = {}) {
    const tasks = this.load();
    const now = new Date().toISOString();
    const created = items.map((item, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      title: item.title || item.action || "مهمة",
      description: item.description || "",
      action: item.action || "review_only",
      risk: item.risk || "low",
      requiresApproval: item.requiresApproval !== false,
      parameters: item.parameters || {},
      status: "pending",
      result: null,
      createdAt: now,
      ...meta
    }));
    this.save([...created, ...tasks]);
    return created;
  },
  update(id, patch) { const tasks=this.load().map(t=>t.id===id?{...t,...patch,updatedAt:new Date().toISOString()}:t); this.save(tasks); return tasks.find(t=>t.id===id); },
  clear() { localStorage.removeItem(this.KEY); }
};
