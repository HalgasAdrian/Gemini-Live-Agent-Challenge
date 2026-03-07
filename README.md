# Gemini Live Agent

A real-time multimodal AI agent powered by Google's Gemini Live API.
Talk naturally, share your camera, and get intelligent responses
with full interruption support.

Built for the **#GeminiLiveAgentChallenge** hackathon.

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- A [Gemini API key](https://aistudio.google.com/apikey)

### Option A: Local Development

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_TEAM/gemini-live-agent.git
cd gemini-live-agent

# 2. Set up your virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# 3. Install dependencies
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

# 4. Copy env and add your Gemini API key
cp .env.example .env              # Windows: copy .env.example .env
```

#### Mac/Linux

```bash
make dev
# Open http://localhost:3000
```

#### Windows

Open **two separate terminals**:

```powershell
# Terminal 1 — Backend
cd backend
uvicorn app.main:app --reload --port 8080

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Then open http://localhost:3000

### Option B: Docker

```bash
# Add your GEMINI_API_KEY to .env first
docker compose up --build
# Open http://localhost:3000
```

## Architecture

![Architecture Diagram](docs/architecture.png)

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | Next.js 14, React, Tailwind CSS   |
| Backend   | FastAPI, Python 3.12              |
| AI Model  | Gemini 2.5 Flash (Live API)       |
| Transport | WebSockets (binary + JSON)        |
| Cloud     | Cloud Run, Firestore, Secret Mgr  |
| SDK       | google-genai (Python)             |

## Features

- Real-time voice conversation with Gemini
- Camera/vision input — show things and ask about them
- Natural interruption handling
- Pluggable agent personas (general, tutor, translator, cooking)
- Text input fallback
- Session logging to Firestore
- One-command Cloud Run deployment

## Deployment

```bash
# Set your GCP project
export GCP_PROJECT_ID=your-project-id

# Deploy backend to Cloud Run
make deploy

# Frontend deploys to Vercel
cd frontend && npx vercel --prod
```

## Team

- **Person A** — Backend & Gemini integration
- **Person B** — Frontend & UI
- **Person C** — Infrastructure & deployment

## License

MIT