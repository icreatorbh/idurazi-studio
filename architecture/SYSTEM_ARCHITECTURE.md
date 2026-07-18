# iDurazi Studio System Architecture

**Baseline:** 3.0  
**Product:** Local-first Editorial Intelligence Platform  
**Primary client:** Adobe Premiere Pro

## Layered architecture

```text
Presentation
├── Premiere Extension
├── Desktop Dashboard
└── Future Web Dashboard

Application
├── Editing Engine
├── Archive Engine
├── Identity Engine
├── AI Engine
└── Automation Engine

Domain
├── People / Mentions / Speakers
├── Episodes / Transcripts / Quotes / Topics
├── Assets / Projects / Sequences
└── Identity Audits / Evidence

Infrastructure
├── SQLite Provider
├── Future PostgreSQL Provider
├── File Storage Provider
├── Ollama / Whisper / FFmpeg Providers
└── Premiere Adapter
```

## Mandatory rules

1. Premiere is an adapter, not the platform core.
2. Domain logic must not import Premiere, SQLite, Ollama, Whisper, or FFmpeg.
3. Infrastructure is resolved through provider contracts and dependency injection.
4. SQLite is the Desktop default; PostgreSQL is reserved for shared institutional mode.
5. Every timeline-changing action requires preview, approval, audit, and undo or compensation.
6. No feature enters implementation before its Stage, Engine, entities, dependencies, tests, and recovery behavior are documented.
