# Provider Architecture

ابتداءً من v2.2.0 لا تتعامل نواة iDurazi Studio مباشرة مع Ollama أو faster-whisper أو FFmpeg أو التخزين. تتعامل مع عقود ثابتة عبر `ProviderContainer`.

## المزودات الافتراضية

- `ai`: OllamaProvider
- `transcription`: FasterWhisperProvider
- `storage`: JsonStorageProvider
- `media`: FfmpegProvider

## الاستبدال

يمكن تسجيل مزود بديل يطبق الأساليب المطلوبة، مثل LM Studio بدل Ollama أو SQLite بدل JSON، دون تعديل Workflow Engine أو Premiere Copilot.

## الفحص

بعد تشغيل الخدمة افتح:

`GET http://127.0.0.1:37841/providers`

لرؤية المزودات المسجلة وحالتها.
