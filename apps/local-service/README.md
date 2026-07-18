# iDurazi Local AI Service v1.2.0

Node.js control layer for Ollama and faster-whisper.

## One-time local transcription setup

Windows: `setup-whisper-windows.bat`
PowerShell: `./setup-whisper-windows.ps1`
macOS/Linux: `bash setup-whisper-macos-linux.sh`

## Start

`npm start`

## Endpoints

- `GET /health`
- `GET /transcription/health`
- `POST /transcribe`
- `POST /chapters`
- `POST /copilot/plan`
- `POST /analyze`

Transcription outputs are stored in the `outputs` directory by default.
