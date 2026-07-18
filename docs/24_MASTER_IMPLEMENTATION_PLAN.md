# Master Implementation Plan

هذه الوثيقة هي المرجع الملزم لمنع إسقاط أي بند. لا يُعد البند مكتملًا إلا إذا كان له تنفيذ واختبار وتوثيق.

## الحالة حتى v2.5.0

| المجال | الحالة | الإصدار | الدليل |
|---|---|---:|---|
| Monorepo والأساس المحلي | مكتمل | 2.0 | التطبيقات والحزم والخدمات والوثائق |
| People Repository | مكتمل مع بقاء توحيد مخزن الأشخاص لاحقًا | 2.1 | واجهة الأشخاص وAPI |
| Smart Lower Third suggestions | مكتمل | 2.1 | مطابقة الأشخاص ومعاينة قبل الإدراج |
| Provider Architecture وDI | مكتمل | 2.2 | provider-core/container والمزودات |
| Unified Archive Repository | مكتمل على JSON | 2.3 | people/episodes/transcripts/topics/quotes/assets/links |
| Unified Search | مكتمل نصيًا | 2.3 | `/archive/search` |
| Archive Dashboard | مكتمل داخل Premiere | 2.4 | تبويب الأرشيف |
| Interview Import Pipeline | مكتمل للمدخلات المنظمة | 2.4 | الحلقة والنص والموضوعات والاقتباسات والعلاقات |
| Person Entity Resolution | مكتمل للنسخة القاعدية | 2.5 | mentions/aliases/confidence/review |
| Identity merge + undo + audit | مكتمل | 2.5 | identityAudits وSnapshot |

## المراحل الملزمة التالية

### v2.6 — SQLite, Migration, Job Queue, Recovery
- نقل Archive وPeople إلى SQLite واحد.
- ترحيل JSON دون فقد البيانات.
- معاملات Transactions وفهارس ونسخ احتياطي.
- Job Queue للـWhisper والتحليل والاستيراد.
- استئناف المهام بعد إغلاق الخدمة.

### v2.7 — Speaker Diarization & Speaker Identity
- فصل المتحدثين إلى Speaker A/B/C.
- ربط المتحدث بالضيف أو المحاور.
- مراجعة يدوية للمتحدثين.
- عدم الخلط بين Speaker وPerson Mention.

### v2.8 — Automated Mention Extraction & Context Windows
- استخراج أسماء الأشخاص آليًا من Segments.
- نوافذ سياق زمنية ونصية.
- Coreference للاسم الأول والضمائر بحذر.
- معالجة اللهجة وأخطاء Whisper وقاموس أسماء الدراز.

### v2.9 — Semantic Search & Evidence
- Embeddings محلية قابلة للاستبدال.
- بحث دلالي وهجين مع النص الكامل.
- كل نتيجة مرتبطة بالمصدر والتوقيت والثقة.
- فلاتر الشخص والحلقة والفترة والموضوع.

### v2.10 — Archive Asset Ingestion
- الصور والفيديو والصوت والوثائق.
- Checksums ومنع التكرار وMetadata.
- Proxy/thumbnail وRelinking للملفات المنقولة.

### v2.11 — Timeline Execution & Graphics Reliability
- تنفيذ Smart Lower Thirds من السجل الموحّد.
- تتبع القالب والإصدار والحقول.
- Preview/approval/undo موثوق.
- اختبارات Premiere فعلية على Windows وmacOS حيث ينطبق.

### v2.12 — Desktop/Web Operations Dashboard
- إدارة الأرشيف خارج Premiere.
- مراجعة الهوية والمهام والاستيراد والنسخ الاحتياطي.
- صلاحيات محلية وسجل عمليات.

### v2.13 — Export, Interchange, Preservation
- JSON/CSV/SRT/VTT/EDL/XML حيث ينطبق.
- حزم أرشيف قابلة للنقل.
- تقارير provenance وسجل التعديلات.

### v2.14 — Quality, Security, Observability
- Schema validation، rate limits محلية، sanitization.
- structured logs، health metrics، diagnostics.
- اختبارات تكامل واستعادة وفساد قاعدة البيانات.

### v3.0 — Institutional Integration
- MCP اختياري.
- API مؤسسي وصلاحيات متعددة المستخدمين.
- مزامنة اختيارية وخادم شبكي.
- Docker اختياري للنشر، وليس شرطًا للتشغيل المحلي.

## بوابة الإصدار الكامل
لا يسمى النظام Production Complete قبل اكتمال: SQLite، recovery، diarization، automated mentions، semantic evidence search، asset ingestion، reliable Premiere execution، backups، exports، security، واختبارات الاستعادة.
