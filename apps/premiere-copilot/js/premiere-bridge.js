/** Premiere Pro UXP bridge — requires Premiere Pro 25.6+. */
const ppro = require("premierepro");
const { storage } = require("uxp");
const fs = storage.localFileSystem;

const IDURAZI_FIELD_LABELS = { name: "الاسم", role: "الوصف", kicker: "التعريف", meta: "البيانات" };
const IDURAZI_TEMPLATES = [
  { code: "LT01", name: "LT01_Editorial_Name_Title", purpose: "اسم كامل + لقب/صفة تحريري" },
  { code: "LT02", name: "LT02_Editorial_Name", purpose: "اسم فقط" },
  { code: "LT03", name: "LT03_Silent_Name_Title_RECOMMENDED", purpose: "اسم + صفة، نسخة هادئة موصى بها" },
  { code: "LT04", name: "LT04_Silent_Name", purpose: "اسم فقط، نسخة هادئة" },
  { code: "LT05", name: "LT05_Program_Guest", purpose: "ضيف برنامج" },
  { code: "LT06", name: "LT06_Presenter", purpose: "مقدم البرنامج" },
  { code: "LT07", name: "LT07_Crew_Credit", purpose: "اعتماد طاقم العمل" },
  { code: "LT08", name: "LT08_Location", purpose: "اسم موقع التصوير" },
  { code: "LT09", name: "LT09_Archive_Person", purpose: "شخصية أرشيفية" },
  { code: "LT10", name: "LT10_Archive_Source", purpose: "مصدر مادة أرشيفية" },
  { code: "LT11", name: "LT11_Quote", purpose: "اقتباس" },
  { code: "LT12", name: "LT12_Continuation", purpose: "استمرارية متحدث" }
];

const PremiereBridge = {
  MOGRT_FOLDER_TOKEN: "idurazi_mogrt_folder_token_v1",

  async getActiveProject() {
    const project = await ppro.Project.getActiveProject();
    if (!project) throw new Error("لا يوجد مشروع مفتوح في Premiere Pro.");
    return project;
  },

  async getActiveSequence() {
    const project = await this.getActiveProject();
    const sequence = await project.getActiveSequence();
    if (!sequence) throw new Error("افتح Sequence واجعله نشطًا أولًا.");
    return sequence;
  },

  async pickAudioOrVideoFile() {
    return await fs.getFileForOpening({ types: ["mp3", "wav", "m4a", "mp4", "mov", "webm", "ogg"] });
  },

  getNativePath(entry) { return fs.getNativePath(entry); },

  async pickMogrtFolder() {
    const folder = await fs.getFolder();
    if (!folder) return null;
    const token = await fs.createPersistentToken(folder);
    localStorage.setItem(this.MOGRT_FOLDER_TOKEN, token);
    return folder;
  },

  async getSavedMogrtFolder() {
    const token = localStorage.getItem(this.MOGRT_FOLDER_TOKEN);
    if (!token) return null;
    try { return await fs.getEntryForPersistentToken(token); }
    catch (_) { localStorage.removeItem(this.MOGRT_FOLDER_TOKEN); return null; }
  },

  async scanMogrtItems(folderOverride) {
    const folder = folderOverride || await this.getSavedMogrtFolder();
    if (!folder) throw new Error("اختر مجلد قوالب MOGRT أولًا.");
    const results = [];
    const walk = async (dir, treePath) => {
      const entries = await dir.getEntries();
      for (const entry of entries) {
        if (entry.isFolder) await walk(entry, treePath + "/" + entry.name);
        else if (entry.name && entry.name.toLowerCase().endsWith(".mogrt")) {
          results.push({
            name: entry.name,
            treePath: treePath + "/" + entry.name,
            nativePath: fs.getNativePath(entry),
            file: entry
          });
        }
      }
    };
    await walk(folder, folder.name || "MOGRT");
    return results;
  },

  getIDuraziTemplateInfo(code) { return IDURAZI_TEMPLATES.find(t => t.code === code) || null; },
  findMogrtByCode(items, code) {
    const upper = String(code || "").toUpperCase();
    return items.find(i => i.name.toUpperCase().startsWith(upper)) || null;
  },

  async insertMogrtAtTime(mogrtPath, timeInSeconds, oneBasedVideoTrack, textFields) {
    if (!mogrtPath) throw new Error("مسار ملف MOGRT غير متوفر.");
    const project = await this.getActiveProject();
    const sequence = await this.getActiveSequence();
    const editor = ppro.SequenceEditor.getEditor(sequence);
    const time = ppro.TickTime.createWithSeconds(Number(timeInSeconds) || 0);
    const videoTrackIndex = Math.max(0, (Number(oneBasedVideoTrack) || 2) - 1);
    const inserted = await editor.insertMogrtFromPath(mogrtPath, time, videoTrackIndex, 0);
    const clip = (inserted || []).find(x => x && typeof x.getComponentChain === "function") || null;
    let fillReport = { changed: [], skipped: [], errors: [] };
    if (clip && textFields) fillReport = await this.fillIDuraziTextFields(project, clip, textFields);
    return { insertedItems: inserted || [], clip, fillReport };
  },

  async fillIDuraziTextFields(project, clip, textFields) {
    const report = { changed: [], skipped: [], errors: [] };
    const desiredByLabel = {};
    Object.keys(IDURAZI_FIELD_LABELS).forEach(key => {
      const value = textFields[key];
      if (value !== undefined && value !== null && String(value) !== "") desiredByLabel[IDURAZI_FIELD_LABELS[key]] = String(value);
    });
    if (!Object.keys(desiredByLabel).length) return report;

    const chain = await clip.getComponentChain();
    const componentCount = chain.getComponentCount();
    const actions = [];

    for (let i = 0; i < componentCount; i++) {
      const component = chain.getComponentAtIndex(i);
      const componentName = await component.getDisplayName();
      const paramCount = component.getParamCount();
      for (let p = 0; p < paramCount; p++) {
        const param = component.getParam(p);
        const label = param.displayName || componentName;
        const targetValue = desiredByLabel[label];
        if (targetValue === undefined) continue;
        try {
          const keyframe = param.createKeyframe(targetValue, false);
          let action;
          project.lockedAccess(() => { action = param.createSetValueAction(keyframe, true); });
          if (action) actions.push({ action, label });
        } catch (e) {
          report.errors.push(label + ": " + (e.message || e));
        }
      }
    }

    if (actions.length) {
      project.lockedAccess(() => {
        project.executeTransaction(compound => {
          actions.forEach(item => { if (compound.addAction(item.action)) report.changed.push(item.label); });
        }, "تعبئة نصوص iDurazi MOGRT");
      });
    }

    Object.keys(desiredByLabel).forEach(label => {
      if (!report.changed.includes(label) && !report.errors.some(e => e.startsWith(label + ":"))) report.skipped.push(label);
    });
    return report;
  }
};

PremiereBridge.getProjectSnapshot = async function() {
  const snapshot = { available: false, projectName: null, sequenceName: null, capturedAt: new Date().toISOString(), warnings: [] };
  try {
    const project = await this.getActiveProject();
    snapshot.available = true;
    try { snapshot.projectName = typeof project.getName === "function" ? await project.getName() : (project.name || null); }
    catch (e) { snapshot.warnings.push("تعذر قراءة اسم المشروع"); }
    try {
      const sequence = await project.getActiveSequence();
      if (sequence) {
        snapshot.sequenceName = typeof sequence.getName === "function" ? await sequence.getName() : (sequence.name || null);
        snapshot.hasActiveSequence = true;
      } else snapshot.hasActiveSequence = false;
    } catch (e) { snapshot.warnings.push("تعذر قراءة الـ Sequence النشط"); }
  } catch (e) {
    snapshot.error = e.message || String(e);
  }
  return snapshot;
};

PremiereBridge.executeCopilotTask = async function(task) {
  const action = task && task.action;
  if (action === "refresh_project_context") return await this.getProjectSnapshot();
  if (action === "scan_mogrt_library") {
    const items = await this.scanMogrtItems();
    return { count: items.length, files: items.map(x => x.name) };
  }
  if (action === "insert_mogrt") {
    const p = task.parameters || {};
    const items = await this.scanMogrtItems();
    const item = this.findMogrtByCode(items, p.templateCode);
    if (!item) throw new Error(`لم أجد قالب ${p.templateCode || "المطلوب"}.`);
    return await this.insertMogrtAtTime(item.nativePath, Number(p.timeSeconds)||0, Number(p.track)||2, p.textFields||{});
  }
  throw new Error("هذه المهمة تحتاج مراجعة أو أن أداة تنفيذها لم تُضف بعد: " + action);
};

PremiereBridge.tickSeconds = function(t) {
  if (!t) return 0;
  if (typeof t.seconds === "number") return t.seconds;
  if (typeof t.getSeconds === "function") { try { return Number(t.getSeconds()) || 0; } catch (_) {} }
  return 0;
};

PremiereBridge.getTimelineSnapshot = async function(options = {}) {
  const sequence = await this.getActiveSequence();
  const result = { sequenceName:null, videoTracks:[], audioTracks:[], markers:[], capturedAt:new Date().toISOString(), totals:{videoClips:0,audioClips:0} };
  try { result.sequenceName = typeof sequence.getName === "function" ? await sequence.getName() : (sequence.name || null); } catch (_) {}
  const readGroup = async (kind) => {
    const countMethod = kind === "video" ? "getVideoTrackCount" : "getAudioTrackCount";
    const getMethod = kind === "video" ? "getVideoTrack" : "getAudioTrack";
    const count = typeof sequence[countMethod] === "function" ? await sequence[countMethod]() : 0;
    const tracks=[];
    for (let i=0;i<count;i++) {
      const track=await sequence[getMethod](i);
      const row={index:i+1,name:track.name||`${kind} ${i+1}`,muted:null,clips:[]};
      try { row.muted=await track.isMuted(); } catch (_) {}
      let items=[];
      try { items=await track.getTrackItems(1,false); } catch (_) { try { items=await track.getTrackItems(1,true); } catch(__){} }
      for (const item of items||[]) {
        const clip={name:"",startSeconds:0,endSeconds:0,durationSeconds:0,disabled:null,selected:null};
        try { clip.name=await item.getName(); } catch (_) {}
        try { clip.startSeconds=this.tickSeconds(await item.getStartTime()); } catch (_) {}
        try { clip.endSeconds=this.tickSeconds(await item.getEndTime()); } catch (_) {}
        try { clip.durationSeconds=this.tickSeconds(await item.getDuration()); } catch (_) { clip.durationSeconds=Math.max(0,clip.endSeconds-clip.startSeconds); }
        try { clip.disabled=await item.isDisabled(); } catch (_) {}
        try { clip.selected=await item.getIsSelected(); } catch (_) {}
        row.clips.push(clip);
      }
      tracks.push(row);
    }
    return tracks;
  };
  result.videoTracks=await readGroup("video");
  result.audioTracks=await readGroup("audio");
  result.totals.videoClips=result.videoTracks.reduce((n,t)=>n+t.clips.length,0);
  result.totals.audioClips=result.audioTracks.reduce((n,t)=>n+t.clips.length,0);
  try {
    const markers=await ppro.Markers.getMarkers(sequence);
    const all=await markers.getMarkers();
    result.markers=(all||[]).map((m,index)=>({index,name:m.name||`Marker ${index+1}`,comments:m.comments||"",startSeconds:this.tickSeconds(m.startTime),durationSeconds:this.tickSeconds(m.duration),type:m.type||"Comment",colorIndex:m.colorIndex}));
  } catch (e) { result.markerWarning=e.message||String(e); }
  return result;
};

PremiereBridge.createMarkers = async function(markerDefs) {
  const defs=(markerDefs||[]).filter(x=>Number.isFinite(Number(x.timeSeconds)) && Number(x.timeSeconds)>=0);
  if (!defs.length) throw new Error("لا توجد Markers صالحة للإنشاء.");
  const project=await this.getActiveProject();
  const sequence=await this.getActiveSequence();
  const collection=await ppro.Markers.getMarkers(sequence);
  const actions=[];
  for (const d of defs) {
    const start=ppro.TickTime.createWithSeconds(Number(d.timeSeconds)||0);
    const duration=ppro.TickTime.createWithSeconds(Math.max(0,Number(d.durationSeconds)||0));
    const action=collection.createAddMarkerAction(String(d.name||"iDurazi Marker"),String(d.markerType||"Comment"),start,duration,String(d.comments||""));
    if (action) actions.push(action);
  }
  project.lockedAccess(()=>project.executeTransaction(compound=>actions.forEach(a=>compound.addAction(a)),`إضافة ${actions.length} Markers من iDurazi`));
  const all=await collection.getMarkers();
  const created=[];
  for (const d of defs) {
    const found=(all||[]).find(m=>String(m.name||"")===String(d.name||"iDurazi Marker") && Math.abs(this.tickSeconds(m.startTime)-Number(d.timeSeconds))<0.05 && !created.includes(m));
    if (found) created.push(found);
  }
  const colorActions=[];
  created.forEach((m,i)=>{ const c=Number(defs[i]?.colorIndex); if(Number.isInteger(c)&&c>=0&&c<=7){try{const a=m.createSetColorByIndexAction(c);if(a)colorActions.push(a);}catch(_){}} });
  if(colorActions.length) project.lockedAccess(()=>project.executeTransaction(compound=>colorActions.forEach(a=>compound.addAction(a)),"تلوين Markers من iDurazi"));
  return {count:actions.length,createdMarkers:created,summary:defs.map(d=>({name:d.name,timeSeconds:Number(d.timeSeconds),comments:d.comments||""}))};
};

PremiereBridge.removeMarkers = async function(markerObjects) {
  const markers=(markerObjects||[]).filter(Boolean);
  if(!markers.length) throw new Error("لا توجد مراجع Markers متاحة للتراجع في هذه الجلسة.");
  const project=await this.getActiveProject();
  const sequence=await this.getActiveSequence();
  const collection=await ppro.Markers.getMarkers(sequence);
  const actions=markers.map(m=>{try{return collection.createRemoveMarkerAction(m);}catch(_){return null;}}).filter(Boolean);
  project.lockedAccess(()=>project.executeTransaction(compound=>actions.forEach(a=>compound.addAction(a)),`تراجع: إزالة ${actions.length} Markers`));
  return {removed:actions.length};
};

const _executeCopilotTaskV14 = PremiereBridge.executeCopilotTask.bind(PremiereBridge);
PremiereBridge.executeCopilotTask = async function(task) {
  const action=task&&task.action;
  if(action==="read_timeline") return await this.getTimelineSnapshot();
  if(action==="create_markers") return await this.createMarkers((task.parameters||{}).markers||[]);
  return await _executeCopilotTaskV14(task);
};
