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

# 2. Set up backend
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # Add your GEMINI_API_KEY

# 3. Start backend
uvicorn app.main:app --reload --port 8080

# 4. In a new terminal — set up frontend
cd frontend
npm install
cp .env.local.example .env.local

# 5. Start frontend
npm run dev

# 6. Open http://localhost:3000
```

Or use the Makefile shortcut:
```bash
make install                      # Install everything
make dev                          # Start both servers
```

### Option B: Docker

```bash
# Add your GEMINI_API_KEY to backend/.env first
docker compose up --build
# Open http://localhost:3000
```

## Architecture

![Architecture Diagram](docs/architecture.png)

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | Next.js 14, React, Tailwind CSS   |
| Backend   | FastAPI, Python 3.12              |
| AI Model  | Gemini 2.0 Flash (Live API)       |
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