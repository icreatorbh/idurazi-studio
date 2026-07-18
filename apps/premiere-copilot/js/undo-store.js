const UndoStore = {
  KEY: "idurazi_undo_history_v1",
  runtime: [],
  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); } catch (_) { return []; } },
  save(items) { localStorage.setItem(this.KEY, JSON.stringify(items.slice(0, 100))); },
  push(entry, runtimeData) {
    const item = { id:`undo-${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt:new Date().toISOString(), status:"applied", reversible:false, ...entry };
    this.save([item, ...this.load()]);
    if (runtimeData) { this.runtime.unshift({ id:item.id, data:runtimeData }); item.reversible = true; this.save([item, ...this.load().filter(x=>x.id!==item.id)]); }
    return item;
  },
  update(id, patch) { const items=this.load().map(x=>x.id===id?{...x,...patch,updatedAt:new Date().toISOString()}:x); this.save(items); return items.find(x=>x.id===id); },
  latestReversible() { const history=this.load(); return history.find(h=>h.status==="applied" && h.reversible && this.runtime.some(r=>r.id===h.id)); },
  runtimeFor(id) { return this.runtime.find(r=>r.id===id); }
};
