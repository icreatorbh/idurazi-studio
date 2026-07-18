
## v2.5 — Person Entity Resolution & Identity Review

يفصل النظام بين سجل الشخص الموحّد وبين كل إشارة اسمية وردت حرفيًا في الترانسكريبت. يدعم الأسماء البديلة، درجات الثقة، مراجعة الحالات الغامضة، دمج السجلات المتكررة والتراجع عن الدمج مع سجل تدقيق. راجع `docs/22_PERSON_ENTITY_RESOLUTION.md` و`docs/23_IDENTITY_REVIEW.md` و`docs/24_MASTER_IMPLEMENTATION_PLAN.md`.

# iDurazi Studio

**الإصدار:** 2.0.0 Foundation  
**الحالة:** نواة تشغيلية قابلة للتوسع  
**المبدأ:** Local-first، والسحابة اختيارية.

منصة إنتاج وثائقي محلية تجمع إضافة Premiere، خدمة Node.js، Ollama، faster-whisper، محرك أدوات، ومحرك Workflows في مشروع واحد منظم.

## ابدأ من هنا

1. ثبّت Node.js 18 أو أحدث، Ollama، وPython 3.10 أو أحدث.
2. من جذر المشروع نفّذ:

```bash
npm install
```

3. ثبّت Whisper محليًا:

```text
Windows: apps/local-service/setup-whisper-windows.bat
macOS/Linux: apps/local-service/setup-whisper-macos-linux.sh
```

4. نزّل نموذج Ollama:

```bash
ollama pull qwen3:8b
```

5. شغّل الخدمة:

```bash
npm start
```

6. في UXP Developer Tool حمّل المجلد:

```text
apps/premiere-copilot
```

7. عنوان الخدمة الافتراضي:

```text
http://127.0.0.1:37841
```

## ما يعمل حاليًا

- Premiere Copilot من الإصدار السابق مع Timeline Reader وMarkers وPreview وUndo.
- تفريغ محلي عبر faster-whisper وتصدير TXT/SRT/VTT/JSON.
- Smart Chapters عبر Ollama وتحويلها إلى Markers بعد الموافقة.
- Tool Registry مركزي يصف الأدوات ومستوى الخطورة وإمكانية التراجع.
- Workflow Engine ينفذ مسارات متعددة الخطوات مع Preview/Approval.
- CLI لتجربة الأدوات وWorkflows خارج Premiere.
- مخطط SQLite للأشخاص والبرامج والحلقات والترانسكريبت والعلاقات.
- بنية Plugins جاهزة للوحدات المستقبلية.

## بنية المشروع

```text
apps/
  premiere-copilot/   إضافة Adobe UXP
  local-service/      خدمة Node.js المحلية
  cli/                واجهة سطر الأوامر
packages/
  orchestrator/       التخطيط والتوجيه
  tool-registry/      تعريف الأدوات والصلاحيات
  workflow-engine/    تشغيل مسارات العمل
  plugin-system/      تحميل الوحدات
  shared/             أنواع وأخطاء ومساعدات مشتركة
services/
  ollama/             عميل Ollama
  whisper/            واجهة التفريغ
  sqlite/             طبقة قاعدة البيانات
  ffmpeg/             تجهيز مستقبلي للوسائط
database/
  schema/ migrations/ seeds/
docs/                 أدلة المستخدم والمطور والقرارات
```

## سير العمل الافتراضي: Import Interview

```text
Transcribe → Generate Chapters → Detect People → Suggest Lower Thirds → Preview
```

الخطوات التي تغيّر Premiere لا تُنفّذ تلقائيًا، بل تتطلب الموافقة.

## التوثيق

ابدأ بملف [docs/00_START_HERE.md](docs/00_START_HERE.md)، ثم راجع التثبيت، المعمارية، إضافة Premiere، Ollama، Whisper، قاعدة البيانات، API، ودليل التطوير.

## فحص المشروع

```bash
npm run check
npm test
```

## ملاحظات مهمة

- أول تنزيل لنموذج Whisper يحتاج اتصالًا بالإنترنت؛ بعد ذلك يعمل محليًا.
- Ollama والنماذج المحلية مجانية، لكن استهلاك الكهرباء والعتاد يقع على الجهاز.
- التعرف الحقيقي على المتحدثين Diarization ليس مفعّلًا بعد؛ الهيكل مهيأ له.
- قاعدة البيانات في هذه النسخة مخطط ومحوّل خفيف، وليست واجهة إدارة كاملة بعد.


## v2.1.0 — People Repository + Smart Lower Thirds

أضيف مستودع أشخاص محلي، واجهة إدارة الضيوف، مطابقة الأسماء بواسطة Ollama، وإرسال اقتراحات Lower Thirds إلى قائمة المعاينة قبل التنفيذ. راجع `docs/15_PEOPLE_REPOSITORY.md` و`docs/16_SMART_LOWER_THIRDS.md`.

## Provider Architecture — v2.2.0

أصبحت خدمات الذكاء والتفريغ والوسائط والتخزين قابلة للاستبدال عبر Dependency Injection:

```text
Application → ProviderContainer → AI / Transcription / Storage / Media Provider
```

المزودات الافتراضية محلية: Ollama وfaster-whisper وJSON وFFmpeg. راجع `docs/17_PROVIDER_ARCHITECTURE.md` وطرفية `/providers` لفحص الحالة.

## v2.3.0 — Archive Repository + Unified Search

أضيف مستودع أرشيف موحد وواجهات API للبحث والربط والحفظ. راجع:
- `docs/18_ARCHIVE_REPOSITORY.md`
- `docs/19_UNIFIED_SEARCH.md`

### فحص سريع

```bash
npm install
npm test
npm run check
npm start
```

ثم افتح:

```text
http://127.0.0.1:37841/archive/stats
```

## v2.4 Archive Dashboard and Interview Import

Open **الأرشيف** in Premiere Copilot to search and browse all connected archive entities. Open **استيراد مقابلة** to create a complete archive package from an episode title, guests, topics, summary, and transcript.

The import produces an auditable batch record and links the episode to its transcript, guests, topics, quotes, and assets. See `docs/20_ARCHIVE_DASHBOARD.md` and `docs/21_INTERVIEW_IMPORT_PIPELINE.md`.

---

## Architecture 3.0 and GitHub governance

The canonical project direction is now defined in:

- `architecture/SYSTEM_ARCHITECTURE.md`
- `planning/MASTER_EXECUTION_PLAN.md`
- `planning/FEATURE_REGISTRY.md`
- `adr/`
- `CONTRIBUTING.md`
- `REPOSITORY_SETUP.md`

The immediate implementation target is **Stage 1A: Database Abstraction + SQLite Migration + Job Queue + Recovery**.
