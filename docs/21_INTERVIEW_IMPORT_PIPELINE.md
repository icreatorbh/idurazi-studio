# Interview Import Pipeline

The interview import pipeline turns one reviewed intake into a connected archive package.

## Required input

- episode title
- transcript text

## Optional input

- program and episode number
- guests
- summary
- recorded and published dates
- timed transcript segments
- topics, quotes, assets, and source path

## Generated records

1. episode
2. transcript
3. new people when no exact person exists
4. detected and supplied topics
5. supplied quotes or conservative transcript excerpts
6. assets
7. relationship records
8. an import audit record with a batch ID and counts

## Safety and identity rules

The pipeline reuses exact people and topic names instead of creating duplicates. It does not use generative AI to invent identities. Generated excerpts remain linked to their source episode and transcript. Review the dashboard after every import.

## API

`POST /archive/import/interview`

The body limit is 20 MB. Large media files are not embedded; store their paths as assets and use the transcription workflow before importing.
