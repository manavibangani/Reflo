# Reflo

Reflo is a productivity and collaboration tool for remote teams and friend groups. It helps you reflect on your work, stay in sync with your team, and focus better — all in one place.

## The Problem Reflo Solves

When teams work remotely, three things break down:
- There's no structured way to discuss what's working and what isn't
- People lose track of what everyone is working on day to day
- It's hard to stay focused when you're working alone at home

Reflo fixes all three.

## Core Features

### Retro Sessions
A retro (short for retrospective) is a team meeting where everyone reflects on recent work — what went well, what went wrong, and what to improve next time. In Reflo, retros happen on a live shared board where every team member can add cards simultaneously and see each other's updates in real time. Cards are color-coded so the team can organize feedback visually. Members can vote on cards and react with emojis. When the session ends, an AI automatically generates a summary of the discussion and saves it for future reference.

### Daily Standups
A standup is a quick daily check-in where each person answers three questions: What did I work on yesterday? What am I doing today? Is anything blocking me? In Reflo, standups are async — no meeting needed. Each team member posts their update whenever they're ready and everyone can read them at their own time. This keeps the whole team aligned without scheduling a call.

### Focus Sessions
A focus session is a virtual coworking room. You set a goal, pick a timer (25, 45, 60, or 90 minutes), and your teammates can join you. Everyone can see each other's goals and the shared countdown. When the timer ends, each person marks whether they completed their goal. It creates the feeling of working together even when you're in different cities.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL via Supabase
- **Real-time:** WebSockets
- **AI:** OpenAI API
- **Auth:** JWT

## Project Structure

```
reflo/
├── backend/               # FastAPI backend
│   ├── main.py            # API routes and WebSocket handlers
│   ├── sql/               # Database migration files
│   └── .env               # Environment variables (not committed)
└── frontend/              # React + Vite frontend
    └── src/
        ├── pages/         # Page components
        └── components/    # Shared components
```

## Running Locally

**Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Environment variables needed in `backend/.env`:**
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
JWT_SECRET=your_secret_key
JWT_ALGORITHM=HS256
OPENAI_API_KEY=your_openai_api_key
```
