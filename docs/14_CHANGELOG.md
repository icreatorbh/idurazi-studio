# 2.5.0
- Person Entity Resolution للأسماء الكاملة والمختصرة والبديلة.
- Mention records تحفظ النص كما قيل.
- Identity Review queue وAPI وواجهة Premiere.
- Merge/undo مع Identity Audit snapshot.
- Master Implementation Plan مدقق يمنع نسيان المراحل اللاحقة.
- اختبارات الغموض والربط والدمج والتراجع.

# سجل التغييرات

## 2.0.0 Foundation
إعادة تنظيم monorepo، فصل Premiere عن الخدمة، إضافة Tool Registry وWorkflow Engine وPlugin System وCLI ومخطط SQLite وتوثيق شامل. تم الحفاظ على وظائف v1.6 داخل التطبيقين.


## 2.1.0
- People Repository CRUD.
- Premiere People management tab.
- Smart Lower Third matching using Ollama.
- Confidence display and preview queue integration.
- Documentation for people and lower thirds.

## 2.2.0
- إضافة Provider contracts وProviderContainer.
- نقل Ollama وfaster-whisper خلف مزودات قابلة للاستبدال.
- إضافة مزود JSON ذري ومزود FFmpeg.
- إضافة `/providers` لفحص التسجيل والحالة.
- إضافة اختبارات Dependency Injection وتوثيق ADR.

## 2.4.0

- Added Archive Dashboard to Premiere Copilot.
- Added interview import pipeline and audit records.
- Added entity listing and relationship navigation.
- Added topic detection, conservative quote extraction, and duplicate reuse.
- Added import pipeline tests and documentation.

## 3.2.0 — Stage 1A Job Queue and Worker Engine

- Added persistent `JobQueue` service over the SQLite job repository.
- Added event-driven `Worker` engine with handler registration.
- Added polling execution, retry handling, missing-handler failure, and startup recovery.
- Added end-to-end queue and worker tests.

## 3.3.0 — Stage 1A Heartbeats and Graceful Shutdown

- Added lease renewal through automatic worker heartbeats.
- Added a manual heartbeat function and abort signal to handler context.
- Added lease ownership-loss detection for safer recovery behavior.
- Added graceful worker shutdown with optional timeout-driven cooperative abort.
- Added tests for long-running jobs, heartbeat renewal, graceful drain, and shutdown timeout.
