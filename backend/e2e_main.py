"""
E2E test server with auth bypass - for local browser testing ONLY.

DO NOT deploy this. NOT for production.

Usage:
  cd backend && TEST_BYPASS_AUTH=1 ./.venv/bin/uvicorn test_main:app --reload --port 8001

Then run frontend:
  cd frontend && npm run dev

Open http://localhost:5173 - you'll be logged in as Test User automatically.

Security: This file is NEVER imported by app/main.py.
It's a separate entry point for local E2E only.
"""

import os

# Safety checks - refuse to run in production environments
if os.environ.get("K_SERVICE"):
    raise RuntimeError(
        "FATAL: e2e_main.py with auth bypass CANNOT run on Cloud Run. "
        "K_SERVICE is set - aborting."
    )

if os.environ.get("TEST_BYPASS_AUTH") != "1":
    raise RuntimeError(
        "e2e_main.py requires TEST_BYPASS_AUTH=1 in environment. "
        "Refusing to start without explicit opt-in."
    )

# Import app AFTER safety checks
from app.main import app
from app.db import get_db, Base, engine
from app.auth import require_user, SESSION_COOKIE, CSRF_COOKIE, generate_csrf_token, hash_token
from app import models
from fastapi import Depends
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

# Create tables for E2E test DB (alembic not run in playwright webServer)
Base.metadata.create_all(bind=engine)


def override_require_user(db: Session = Depends(get_db)):
    test_discord_id = os.environ.get("TEST_BYPASS_AUTH_DISCORD_ID", "123456789012345678")
    user = db.query(models.DiscordUser).filter(
        models.DiscordUser.discord_id == test_discord_id
    ).first()
    if not user:
        user = models.DiscordUser(
            discord_id=test_discord_id,
            username="testuser",
            global_name="Test User",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


app.dependency_overrides[require_user] = override_require_user


# Auth + CSRF cookie middleware for E2E
# CSRFMiddleware validates: header == cookie == HMAC(session_cookie)
# With TEST_BYPASS_AUTH, require_user is overridden, but CSRF still runs.
# So we need to ensure the browser has a valid session + matching CSRF token.
#
# Fixed for #9: previously created a NEW AuthSession on every request with
# missing/invalid cookie, leaking DB rows and causing session flipping on
# parallel requests. Now uses a stable fixed session token, deletes old
# sessions for the test user, and reuses the same session across requests.
_E2E_SESSION_TOKEN = None
_E2E_SESSION_TOKEN_LOCK = None

class E2ETestAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        from app.db import SessionLocal
        import threading
        global _E2E_SESSION_TOKEN, _E2E_SESSION_TOKEN_LOCK
        if _E2E_SESSION_TOKEN_LOCK is None:
            _E2E_SESSION_TOKEN_LOCK = threading.Lock()

        test_discord_id = os.environ.get("TEST_BYPASS_AUTH_DISCORD_ID", "123456789012345678")

        session_token = request.cookies.get(SESSION_COOKIE)
        csrf_cookie = request.cookies.get(CSRF_COOKIE)

        # Validate existing session
        valid_session = False
        if session_token:
            db = SessionLocal()
            try:
                token_hash = hash_token(session_token)
                sess = db.query(models.AuthSession).filter(
                    models.AuthSession.session_token_hash == token_hash
                ).first()
                valid_session = sess is not None and sess.discord_id == test_discord_id
            finally:
                db.close()

        # Mint new session if needed - use stable fixed token to avoid
        # session flipping on parallel requests and DB row accumulation (#9)
        if not valid_session:
            with _E2E_SESSION_TOKEN_LOCK:
                if _E2E_SESSION_TOKEN is not None:
                    session_token = _E2E_SESSION_TOKEN
                    valid_session = True
                else:
                    db = SessionLocal()
                    try:
                        # Ensure test user exists
                        user = db.query(models.DiscordUser).filter(
                            models.DiscordUser.discord_id == test_discord_id
                        ).first()
                        if not user:
                            user = models.DiscordUser(
                                discord_id=test_discord_id,
                                username="testuser",
                                global_name="Test User",
                            )
                            db.add(user)
                            db.commit()
                        # Clean up old AuthSession rows for test user - prevents unbounded growth (#9)
                        db.query(models.AuthSession).filter(
                            models.AuthSession.discord_id == test_discord_id
                        ).delete()
                        db.commit()
                        # Create session with fixed token for stable E2E
                        # (avoids session flipping / CSRF mismatch on parallel requests)
                        session_token = os.environ.get(
                            "TEST_BYPASS_AUTH_SESSION_TOKEN",
                            "test_e2e_fixed_session_token_12345"
                        )
                        token_hash = hash_token(session_token)
                        from datetime import datetime, timezone, timedelta
                        now = datetime.now(timezone.utc).replace(tzinfo=None)
                        # Upsert - delete any existing row with same token_hash first
                        db.query(models.AuthSession).filter(
                            models.AuthSession.session_token_hash == token_hash
                        ).delete()
                        sess = models.AuthSession(
                            session_token_hash=token_hash,
                            discord_id=test_discord_id,
                            created_at=now,
                            expires_at=now + timedelta(days=30),
                            absolute_expires_at=now + timedelta(days=90),
                            last_used_at=now,
                        )
                        db.add(sess)
                        db.commit()
                        _E2E_SESSION_TOKEN = session_token
                    finally:
                        db.close()
                    valid_session = True

        # Generate CSRF token matching the session
        csrf_token = generate_csrf_token(session_token)

        response = await call_next(request)

        # Set cookies if browser was missing them or had invalid ones
        if SESSION_COOKIE not in request.cookies or not valid_session or request.cookies.get(SESSION_COOKIE) != session_token:
            response.set_cookie(
                SESSION_COOKIE, session_token,
                httponly=True, secure=False, samesite="lax", path="/",
                max_age=30*86400,
            )
        if csrf_cookie != csrf_token:
            response.set_cookie(
                CSRF_COOKIE, csrf_token,
                httponly=False, secure=False, samesite="strict", path="/",
            )
        return response


app.add_middleware(E2ETestAuthMiddleware)
