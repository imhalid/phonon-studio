# Phonon Studio

Real-time speech-to-text studio and modern web interface for [Phonon-2](https://github.com/fermionresearch/phonon) (Fermion Research), featuring live WebSocket streaming, an interactive reading teleprompter, in-browser audio conversion, and NVIDIA CUDA GPU acceleration.

![Interface Style](https://img.shields.io/badge/Theme-Neutral%20Dark-zinc?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-black?style=flat-square)
![Speed](https://img.shields.io/badge/Speed-%7E70x--110x%20Realtime-emerald?style=flat-square)

---

## Overview

**Phonon Studio** provides a low-latency, two-column dictation terminal designed specifically for low-bit open speech recognition models. Built with a minimalist brutalist aesthetic (0px border-radius, 1px borders, neutral dark palette, no emojis), it allows you to transcribe hours of audio in seconds or stream live microphone speech directly to the screen word by word.

---

## Features

- **Live WebSocket Dictation:** Streams native 16 kHz mono Float32 PCM frames directly over WebSocket; hypotheses appear live on screen in real time.
- **Studio Two-Column Layout:** Split workstation with controls, prompt deck, and audio preview on the left; full-height live transcript terminal on the right.
- **Reading Teleprompter:** Built-in curated English prompts across 5 categories (Technology, Meeting, Standard, Narrative, Aviation) with instant shuffle.
- **Universal Audio Ingestion:** Direct drag-and-drop support for WAV, FLAC, OGG, AIFF, and automatic in-browser decoding for MP3 and M4A via the Web Audio API.
- **GPU Accelerated:** Full support for `phonon-cuda:1.0.3` running on NVIDIA GPUs via PyTorch CUDA graphs (~70x-110x realtime factor).
- **Zero Python Dependencies:** The proxy server runs entirely on Python's standard library (`http.server` / `urllib`), requiring no `pip install`.

---

## Architecture

```
┌─────────────────────────────────┐           ┌────────────────────────────────┐
│      Browser Client (Port 3000) │           │     Phonon Backend (Port 8000) │
│                                 │           │                                │
│   • Live Mic Float32 Streaming  │──WS────►  │   • GET /v1/audio/stream       │
│   • Drag & Drop Audio Upload    │──HTTP──►  │   • POST /v1/audio/transcribe  │
│   • In-Browser MP3 Decoder      │           │   • NVIDIA GPU (bfloat16)      │
└─────────────────────────────────┘           └────────────────────────────────┘
```

---

## Quickstart

### Prerequisites

- Linux, macOS, or Windows
- [Podman](https://podman.io/) or [Docker](https://www.docker.com/)
- Python 3.8+
- (Optional) NVIDIA GPU with drivers for GPU acceleration

### 1. Clone & Run

```bash
git clone https://github.com/imhalid/phonon-studio.git
cd phonon-studio
chmod +x start.sh stop.sh
./start.sh
```

Open your browser at **http://localhost:3000**.

### 2. Run with Docker Compose

```bash
docker compose up -d
```

### 3. Stop Services

```bash
./stop.sh
```

---

## Configuration

The proxy server and container runtime can be customized with environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the Web Studio frontend. |
| `PHONON_BACKEND_URL` | `http://127.0.0.1:8000` | URL of the running Phonon ASR backend. |
| `PHONON_API_KEY` | `phonon-local` | Bearer token / query param key for endpoint auth. |

---

## Keyboard & Interaction Shortcuts

- **REC Button:** Toggles live microphone capture and WebSocket streaming.
- **Shuffle Prompt:** Cycles through preset sample sentences for effortless reading tests.
- **Export:** Downloads the current transcript workspace as a timestamped `.txt` document.
- **Copy:** Copies transcript text to clipboard in one click.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
Base models and weights courtesy of [Fermion Research](https://github.com/fermionresearch/phonon).
