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
        "FATAL: test_main.py with auth bypass CANNOT run on Cloud Run. "
        "K_SERVICE is set - aborting."
    )

if os.environ.get("TEST_BYPASS_AUTH") != "1":
    raise RuntimeError(
        "test_main.py requires TEST_BYPASS_AUTH=1 in environment. "
        "Refusing to start without explicit opt-in."
    )

# Import app AFTER safety checks
from app.main import app
from app.db import get_db, Base, engine
from app.auth import require_user, SESSION_COOKIE, CSRF_COOKIE, generate_csrf_token, create_session, hash_token
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
class E2ETestAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        from app.db import SessionLocal
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

        # Mint new session if needed
        if not valid_session:
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
                # Create session
                session_token = create_session(db, test_discord_id)
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
                httponly=False, secure=False, samesite="lax", path="/",
            )
        return response


app.add_middleware(E2ETestAuthMiddleware)
