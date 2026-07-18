# Archive Repository

يوحّد هذا المستودع بيانات الأشخاص والحلقات والترانسكريبت والموضوعات والاقتباسات والأصول والعلاقات في ملف محلي واحد.

## الأنواع
- `people`
- `episodes`
- `transcripts`
- `topics`
- `quotes`
- `assets`
- `links`

## المسار
`database/archive/archive.json`

## البحث
`POST /archive/search`

```json
{"query":"بابكو","types":["transcripts","quotes","topics"],"limit":20}
```

## الحفظ أو التحديث
`POST /archive/upsert`

```json
{"type":"episodes","item":{"title":"وجوه درازية 18","program":"وجوه درازية"}}
```

## الربط
`POST /archive/link`

```json
{"fromType":"people","fromId":"person_1","toType":"episodes","toId":"episode_1","relation":"guest_in"}
```
