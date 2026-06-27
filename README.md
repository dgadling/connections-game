# Connections Game

Discord-OAuth web app for running "Connections" icebreaker rounds (pair people, ask questions).

## Stack

- **Backend**: FastAPI + SQLAlchemy (SQLite), Discord OAuth2
- **Frontend**: React + Vite, Tailwind
- **DB**: SQLite (+ Litestream for prod replication)

## Local dev setup

1. Clone, create a virtualenv:
   ```bash
   cd backend
   python -m venv .venv
   .venv/bin/pip install -r requirements.txt
   .venv/bin/pip install -r requirements-test.txt
   cd ../frontend
   npm install
   ```

2. Discord OAuth app:
   - Create at https://discord.com/developers/applications
   - Add redirect URI: `http://localhost:8000/auth/discord/callback`
   - Copy Client ID / Secret

3. Env vars – copy `.env.example` to `.env` and fill in:
   ```
   DISCORD_CLIENT_ID=…
   DISCORD_CLIENT_SECRET=…
   DISCORD_REDIRECT_URI=http://localhost:8000/auth/discord/callback
   DISCORD_OAUTH_FERNET_KEY=…  # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   SUPERUSER_DISCORD_ID=…      # optional, your Discord user ID for admin
   CONNECTIONS_DB=sqlite:///./connections.db
   ```
   All `DISCORD_*` vars are **required at import time** – missing = hard fail (no prod defaults).

4. Run backend:
   ```bash
   cd backend
   set -a; source ../.env; set +a
   .venv/bin/uvicorn app.main:app --reload --port 8000
   ```

5. Run frontend (separate terminal):
   ```bash
   cd frontend
   npm run dev
   ```
   Dev server proxies `/auth`, `/api` to http://localhost:8000 (see `vite.config.js`).

## Tests

Backend:
```bash
cd backend
TEST_BYPASS_AUTH=1 ./backend/.venv/bin/pytest -q
```

Frontend:
```bash
cd frontend
npm test
```

Linting:
```bash
cd backend && .venv/bin/ruff check app tests
cd frontend && npm run lint
```

## Architecture

- `backend/app/main.py` – FastAPI app, OAuth callback, session routes
- `backend/app/auth.py` – session cookies, CSRF HMAC (bound to session), Discord OAuth URL builder – **fail-closed, no prod defaults**
- `backend/app/api/games.py` – game/member/question/pairing CRUD
- `backend/app/pairing.py` – round pairing logic (avoids repeat pairs)
- `backend/app/models.py` – SQLAlchemy models (DiscordUser, Game, GameMember, ConnQuestion, Pairing, etc.)
- `backend/app/crypto.py` – Fernet encrypt/decrypt for Discord OAuth tokens
- `frontend/src/` – React SPA, API client in `api.js`

Auth flow: Discord OAuth → encrypted refresh_token stored → session cookie (30d sliding, 90d absolute) → CSRF double-submit (HMAC-bound).

## Environment variables

| Var | Required | Description |
|---|---|---|
| `DISCORD_CLIENT_ID` | yes | Discord OAuth app client ID |
| `DISCORD_CLIENT_SECRET` | yes | Discord OAuth app secret (also CSRF HMAC key) |
| `DISCORD_REDIRECT_URI` | yes | OAuth callback, e.g. http://localhost:8000/auth/discord/callback |
| `DISCORD_OAUTH_FERNET_KEY` | yes | Fernet key for encrypting Discord tokens |
| `SUPERUSER_DISCORD_ID` | no | Discord ID with owner access to all games |
| `CONNECTIONS_DB` | no | SQLAlchemy DB URL, defaults to `sqlite:///./connections.db` |
