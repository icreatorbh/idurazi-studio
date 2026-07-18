# Archive Dashboard

The Archive Dashboard is the operational browser for the unified iDurazi archive.

## Capabilities

- live counts for people, episodes, transcripts, topics, quotes, assets, and imports
- unified Arabic and English text search
- browsing by entity type
- following relationships between an episode, guest, transcript, topic, quote, or asset
- local-only operation through the Local Service

## Premiere panel

Open **الأرشيف** in iDurazi Premiere Copilot. The dashboard reads from `database/archive/archive.json` through the repository API; the UXP panel never edits the database file directly.

## API

- `GET /archive/stats`
- `GET /archive/list?type=episodes`
- `POST /archive/search`
- `POST /archive/linked`
- `POST /archive/upsert`
- `POST /archive/delete`
