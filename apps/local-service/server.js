const { ArchiveRepository } = require('@idurazi/archive-repository');
const ARCHIVE_DB_PATH = require('path').resolve(__dirname, '../../database/archive/archive.json');
const archiveRepository = new ArchiveRepository(ARCHIVE_DB_PATH);
const { InterviewImportPipeline } = require('@idurazi/interview-import-pipeline');
const { PersonEntityResolver } = require('@idurazi/person-entity-resolution');
const personResolver = new PersonEntityResolver(archiveRepository);
const interviewImportPipeline = new InterviewImportPipeline(archiveRepository,{personResolver});
const { createProviders } = require('./providers');
let providerContainer;
function getProviders(config){ if(!providerContainer) providerContainer=createProviders(config); return providerContainer; }
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PEOPLE_DB_PATH = path.resolve(__dirname, '../../database/people.json');
function ensurePeopleDb() {
  fs.mkdirSync(path.dirname(PEOPLE_DB_PATH), { recursive: true });
  if (!fs.existsSync(PEOPLE_DB_PATH)) fs.writeFileSync(PEOPLE_DB_PATH, JSON.stringify({ people: [] }, null, 2), 'utf8');
}
function loadPeople() { ensurePeopleDb(); return JSON.parse(fs.readFileSync(PEOPLE_DB_PATH, 'utf8')).people || []; }
function savePeople(people) { ensurePeopleDb(); fs.writeFileSync(PEOPLE_DB_PATH, JSON.stringify({ people }, null, 2), 'utf8'); }
function slugId() { return 'person_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
function normalizePerson(input, current={}) {
  const now = new Date().toISOString();
  return {
    id: current.id || input.id || slugId(),
    nameAr: String(input.nameAr || current.nameAr || '').trim(),
    nameEn: String(input.nameEn || current.nameEn || '').trim(),
    titleAr: String(input.titleAr || current.titleAr || '').trim(),
    titleEn: String(input.titleEn || current.titleEn || '').trim(),
    program: String(input.program || current.program || 'وجوه درازية').trim(),
    templateCode: String(input.templateCode || current.templateCode || 'LT01').trim(),
    aliases: Array.isArray(input.aliases) ? input.aliases.map(String).map(x=>x.trim()).filter(Boolean) : (current.aliases || []),
    notes: String(input.notes || current.notes || '').trim(),
    createdAt: current.createdAt || now, updatedAt: now
  };
}
function buildLowerThirdPrompt() {
  return `أنت محرر هوية وضيوف لمشروع iDurazi. طابق الأسماء أو الألقاب المذكورة في الترانسكريبت مع قائمة الأشخاص المعطاة فقط. لا تخترع أشخاصًا. أعد JSON فقط بالشكل {"suggestions":[{"personId":"id","timeSeconds":12,"confidence":0.9,"reason":"سبب","templateCode":"LT01"}]}. اقترح أول ظهور مناسب فقط لكل شخص، وبحد أقصى 12 اقتراحًا.`;
}

const CONFIG_PATH = path.join(__dirname, 'config.json');
function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}
function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function readJson(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw) > limit) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
async function ollamaFetch(config, endpoint, options = {}) {
  const ai = getProviders(config).resolve('ai');
  return ai.request(endpoint, options);
}

function runWhisper(config, filePath, language, model) {
  return getProviders(config).resolve('transcription').transcribe({
    filePath,
    language: language || 'auto',
    model: model || config.whisperModel || 'small',
    device: config.whisperDevice || 'auto',
    computeType: config.whisperComputeType || 'auto'
  });
}
function buildChaptersPrompt() {
  return `أنت محرر وثائقي عربي. حلل الترانسكريبت الموقّت واستخرج الفصول الرئيسية فقط.
أعد JSON فقط: {"chapters":[{"timeSeconds":0,"title":"عنوان مختصر","summary":"وصف قصير","colorIndex":2}]}
القواعد: استخدم توقيت بداية موضوع موجود فعليًا، لا تختر أكثر من 20 فصلًا، تجنب الفصول المتقاربة بلا داعٍ، واجعل العناوين مناسبة ليوتيوب وMarkers Premiere.`;
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
  throw new Error('Model response is not valid JSON');
}

function buildCopilotPlannerPrompt() {
  return `أنت مخطط أوامر داخل iDurazi Premiere Copilot. لا تنفذ شيئًا بنفسك.
حوّل طلب المستخدم إلى خطة قصيرة من مهام قابلة للمراجعة.
أعد JSON فقط بالشكل:
{"summary":"ملخص عربي","tasks":[{"title":"عنوان","description":"شرح","action":"ACTION","risk":"low|medium|high","requiresApproval":true,"parameters":{}}]}

الإجراءات المسموحة فقط:
- refresh_project_context: قراءة معلومات المشروع الحالي فقط.
- scan_mogrt_library: فحص مكتبة MOGRT فقط.
- insert_mogrt: إدراج قالب، ويتطلب parameters: templateCode,timeSeconds,track,textFields.
- analyze_transcript: تحليل نص موجود وإنتاج اقتراحات دون تعديل المشروع.
- read_timeline: قراءة المسارات والمقاطع والـMarkers الحالية. parameters={}
- create_markers: إنشاء Sequence Markers. parameters={"markers":[{"timeSeconds":10,"name":"عنوان","comments":"ملاحظة","durationSeconds":0,"colorIndex":0,"markerType":"Comment"}]}
- organize_bins: مخطط مستقبلي لتنظيم Bins؛ لا ينفذ في هذه النسخة.
- rename_items: مخطط مستقبلي لإعادة التسمية؛ لا ينفذ في هذه النسخة.
- export_metadata: مخطط مستقبلي لتصدير metadata؛ لا ينفذ في هذه النسخة.
- review_only: عندما لا يوجد إجراء آمن أو واضح.

القواعد:
- لا تختر أي action خارج القائمة.
- كل تعديل في Premiere يحتاج requiresApproval=true.
- القراءة فقط risk=low، الإدراج أو الإنشاء risk=medium، الحذف أو إعادة التسمية الجماعية risk=high.
- لا تفترض توقيتًا أو اسم قالب غير موجود في طلب المستخدم أو السياق.
- إذا كانت البيانات ناقصة أنشئ review_only يشرح ما ينقص.
- اكتب بالعربية.`;
}

function buildSystemPrompt(graphics, maxSuggestions) {
  const description = graphics.map(g => `- ${g.code}: ${g.purpose}`).join('\n');
  return `أنت مساعد مونتاج عربي متخصص في iDurazi Broadcast Pack.\nحلل الترانسكريبت ذي التوقيتات واقترح اللحظات المناسبة للقوالب التالية:\n${description}\n\nأعد كائن JSON فقط بالشكل التالي:\n{"suggestions":[{"timeSeconds":12.5,"reason":"سبب مختصر","templateCode":"LT03","textFields":{"name":"","role":"","kicker":"","meta":""}}]}\n\nالقواعد:\n- استخدم أرقام ثوانٍ صحيحة أو عشرية.\n- لا تختر قالبًا غير موجود في القائمة.\n- لا تختر أكثر من ${maxSuggestions} اقتراحًا.\n- اكتب النصوص بالعربية عندما يكون الترانسكريبت عربيًا.`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    const config = loadConfig();
    if (req.method === 'GET' && req.url === '/archive/stats') { return send(res,200,{version:'2.5.0',stats:archiveRepository.stats()}); }
    if (req.method === 'GET' && req.url.startsWith('/archive/list')) { const u=new URL(req.url,'http://localhost'); const type=u.searchParams.get('type'); return send(res,200,{type,items:archiveRepository.list(type,{limit:Number(u.searchParams.get('limit'))||200,offset:Number(u.searchParams.get('offset'))||0})}); }
    if (req.method === 'POST' && req.url === '/archive/import/interview') { const body=await readJson(req,20*1024*1024); return send(res,201,{result:interviewImportPipeline.run(body)}); }
    if (req.method === 'POST' && req.url === '/archive/search') {
      const body=await readJson(req); return send(res,200,{results:archiveRepository.search(body.query,{types:body.types,limit:body.limit||50})});
    }
    if (req.method === 'POST' && req.url === '/archive/upsert') {
      const body=await readJson(req); if(!body.type||!body.item) return send(res,400,{error:'type and item are required'}); return send(res,200,{item:archiveRepository.upsert(body.type,body.item)});
    }
    if (req.method === 'POST' && req.url === '/archive/delete') {
      const body=await readJson(req); return send(res,200,{ok:archiveRepository.remove(body.type,body.id)});
    }
    if (req.method === 'POST' && req.url === '/archive/link') {
      const body=await readJson(req); return send(res,200,{link:archiveRepository.link(body)});
    }
    if (req.method === 'POST' && req.url === '/archive/linked') {
      const body=await readJson(req); return send(res,200,{items:archiveRepository.getLinked(body.entityType,body.entityId)});
    }
    if (req.method === 'POST' && req.url === '/identity/resolve') { const body=await readJson(req); return send(res,201,{mention:personResolver.resolveMention(body)}); }
    if (req.method === 'GET' && req.url.startsWith('/identity/review-queue')) { const items=archiveRepository.list('mentions',{limit:1000}).filter(x=>['review_required','unresolved','deferred'].includes(x.status)); return send(res,200,{items}); }
    if (req.method === 'POST' && req.url === '/identity/review') { const body=await readJson(req); return send(res,200,{mention:personResolver.review(body.mentionId,body.action,body.personId)}); }
    if (req.method === 'POST' && req.url === '/identity/merge') { const body=await readJson(req); return send(res,200,{result:personResolver.mergePeople(body.primaryId,body.duplicateId,{reason:body.reason})}); }
    if (req.method === 'POST' && req.url === '/identity/merge/undo') { const body=await readJson(req); return send(res,200,{audit:personResolver.undoMerge(body.auditId)}); }

    if (req.method === 'GET' && req.url === '/providers') {
      const container = getProviders(config);
      const providers = container.describe();
      const health = {};
      for (const item of providers) health[item.token] = await container.resolve(item.token).health();
      return send(res, 200, { version: '2.4.0', providers, health });
    }

    if (req.method === 'GET' && req.url === '/health') {
      try {
        const tags = await ollamaFetch(config, '/api/tags', { method: 'GET' });
        return send(res, 200, {
          ok: true,
          service: 'iDurazi Local AI Service',
          version: '2.4.0',
          ollama: true,
          ollamaUrl: config.ollamaUrl,
          defaultModel: config.defaultModel,
          models: (tags.models || []).map(m => m.name).filter(Boolean)
        });
      } catch (error) {
        return send(res, 503, { ok: false, service: true, ollama: false, error: error.message });
      }
    }

    if (req.method === 'GET' && req.url === '/people') {
      return send(res, 200, { people: loadPeople() });
    }
    if (req.method === 'POST' && req.url === '/people') {
      const body = await readJson(req);
      const people = loadPeople();
      const person = normalizePerson(body);
      if (!person.nameAr) return send(res, 400, { error: 'nameAr is required' });
      people.push(person); savePeople(people);
      return send(res, 201, { person });
    }
    if (req.method === 'POST' && req.url === '/people/update') {
      const body = await readJson(req);
      const people = loadPeople();
      const i = people.findIndex(p => p.id === body.id);
      if (i < 0) return send(res, 404, { error: 'person not found' });
      people[i] = normalizePerson(body, people[i]); savePeople(people);
      return send(res, 200, { person: people[i] });
    }
    if (req.method === 'POST' && req.url === '/people/delete') {
      const body = await readJson(req);
      const people = loadPeople();
      const next = people.filter(p => p.id !== body.id);
      if (next.length === people.length) return send(res, 404, { error: 'person not found' });
      savePeople(next); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/lower-thirds/suggest') {
      const body = await readJson(req);
      const transcript = String(body.transcript || '').trim();
      if (!transcript) return send(res, 400, { error: 'transcript is required' });
      const people = loadPeople();
      if (!people.length) return send(res, 200, { suggestions: [], warning: 'people repository is empty' });
      const model = String(body.model || config.defaultModel || '').trim();
      const result = await ollamaFetch(config, '/api/chat', { method:'POST', body: JSON.stringify({ model, stream:false, format:'json', options:{temperature:0.05}, messages:[{role:'system',content:buildLowerThirdPrompt()},{role:'user',content:JSON.stringify({people, transcript})}] }) });
      const parsed = extractJson(result?.message?.content);
      const byId = new Map(people.map(p=>[p.id,p]));
      const suggestions = (Array.isArray(parsed.suggestions)?parsed.suggestions:[]).slice(0,12).filter(x=>byId.has(x.personId)).map(x=>{ const p=byId.get(x.personId); return { personId:p.id, timeSeconds:Number(x.timeSeconds)||0, confidence:Math.max(0,Math.min(1,Number(x.confidence)||0)), reason:String(x.reason||''), templateCode:String(x.templateCode||p.templateCode||'LT01'), textFields:{name:p.nameAr,role:p.titleAr,englishName:p.nameEn,englishRole:p.titleEn} }; });
      return send(res,200,{suggestions,model});
    }

    if (req.method === 'GET' && req.url === '/models') {
      const tags = await ollamaFetch(config, '/api/tags', { method: 'GET' });
      return send(res, 200, { models: (tags.models || []).map(m => m.name).filter(Boolean) });
    }


    if (req.method === 'GET' && req.url === '/transcription/health') {
      return send(res, 200, { ok: true, engine: 'faster-whisper', python: config.whisperPython || 'python', model: config.whisperModel || 'small', outputDir: path.resolve(__dirname, config.transcriptionOutputDir || 'outputs') });
    }
    if (req.method === 'POST' && req.url === '/transcribe') {
      const body = await readJson(req);
      const filePath = String(body.filePath || '').trim();
      if (!filePath || !fs.existsSync(filePath)) return send(res, 400, { error: 'filePath is missing or inaccessible' });
      const result = await runWhisper(config, filePath, String(body.language || 'auto'), String(body.model || config.whisperModel || 'small'));
      return send(res, 200, { ...result, engine: 'faster-whisper', serviceVersion: '2.3.0' });
    }
    if (req.method === 'POST' && req.url === '/chapters') {
      const body = await readJson(req);
      const transcript = String(body.transcript || '').trim();
      const model = String(body.model || config.defaultModel || '').trim();
      if (!transcript) return send(res, 400, { error: 'transcript is required' });
      const result = await ollamaFetch(config, '/api/chat', { method: 'POST', body: JSON.stringify({ model, stream: false, format: 'json', options: { temperature: 0.1 }, messages: [{ role: 'system', content: buildChaptersPrompt() }, { role: 'user', content: transcript }] }) });
      const parsed = extractJson(result?.message?.content);
      const chapters = (Array.isArray(parsed.chapters) ? parsed.chapters : []).slice(0, 20).map((c, i) => ({ timeSeconds: Number(c.timeSeconds) || 0, title: String(c.title || `فصل ${i+1}`), summary: String(c.summary || ''), colorIndex: Number.isFinite(Number(c.colorIndex)) ? Number(c.colorIndex) : 2 }));
      return send(res, 200, { chapters, model, serviceVersion: '2.3.0' });
    }

    if (req.method === 'POST' && req.url === '/copilot/plan') {
      const body = await readJson(req);
      const prompt = String(body.prompt || '').trim();
      const model = String(body.model || config.defaultModel || '').trim();
      if (!prompt) return send(res, 400, { error: 'prompt is required' });
      if (!model) return send(res, 400, { error: 'model is required' });
      const context = body.context || {};
      const result = await ollamaFetch(config, '/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature: 0.1 },
          messages: [
            { role: 'system', content: buildCopilotPlannerPrompt() },
            { role: 'user', content: JSON.stringify({ request: prompt, context }) }
          ]
        })
      });
      const parsed = extractJson(result?.message?.content);
      if (!Array.isArray(parsed.tasks)) throw new Error('Planner response does not contain tasks');
      const allowed = new Set(['refresh_project_context','read_timeline','scan_mogrt_library','insert_mogrt','analyze_transcript','create_markers','organize_bins','rename_items','export_metadata','review_only']);
      parsed.tasks = parsed.tasks.slice(0, 12).map(task => ({
        title: String(task.title || task.action || 'مهمة'),
        description: String(task.description || ''),
        action: allowed.has(task.action) ? task.action : 'review_only',
        risk: ['low','medium','high'].includes(task.risk) ? task.risk : 'medium',
        requiresApproval: task.requiresApproval !== false,
        parameters: task.parameters && typeof task.parameters === 'object' ? task.parameters : {}
      }));
      return send(res, 200, {
        planId: `plan-${Date.now()}`,
        summary: String(parsed.summary || 'تم إنشاء خطة قابلة للمراجعة.'),
        tasks: parsed.tasks,
        model,
        serviceVersion: '2.3.0'
      });
    }

    if (req.method === 'POST' && req.url === '/analyze') {
      const body = await readJson(req);
      const transcript = String(body.transcript || '').trim();
      const graphics = Array.isArray(body.availableGraphics) ? body.availableGraphics : [];
      const model = String(body.model || config.defaultModel || '').trim();
      if (!transcript) return send(res, 400, { error: 'transcript is required' });
      if (!graphics.length) return send(res, 400, { error: 'availableGraphics is required' });
      if (!model) return send(res, 400, { error: 'model is required' });
      const result = await ollamaFetch(config, '/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature: Number(config.temperature ?? 0.2) },
          messages: [
            { role: 'system', content: buildSystemPrompt(graphics, config.maxSuggestions || 20) },
            { role: 'user', content: transcript }
          ]
        })
      });
      const parsed = extractJson(result?.message?.content);
      if (!Array.isArray(parsed.suggestions)) throw new Error('Response does not contain suggestions');
      parsed.suggestions = parsed.suggestions.slice(0, config.maxSuggestions || 20);
      return send(res, 200, { ...parsed, model, serviceVersion: '2.3.0' });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    return send(res, 500, { error: error.message || String(error) });
  }
});

const config = loadConfig();
server.listen(config.port, config.host, () => {
  console.log(`iDurazi Local AI Service: http://${config.host}:${config.port}`);
  console.log(`Ollama: ${config.ollamaUrl} | Model: ${config.defaultModel}`);
});
