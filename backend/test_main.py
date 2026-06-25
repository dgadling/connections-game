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
Not committed to git (see .gitignore).
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
from app.auth import require_user
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

# CSRF cookie middleware for E2E - the frontend expects a csrf_token cookie
# that matches the X-CSRF-Token header. The real auth flow sets this during
# OAuth login, but test_main bypasses auth entirely, so we need to set it here.
# Otherwise all POST/PATCH/PUT/DELETE to /api/* get 403 "CSRF token required".
class E2ETestCSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # Set csrf_token cookie if missing - frontend reads this and echoes it back
        # in X-CSRF-Token header for mutating requests
        if "csrf_token" not in request.cookies:
            response.set_cookie(
                "csrf_token", "e2e-test-csrf-token",
                httponly=False, secure=False, samesite="lax", path="/"
            )
        return response

# Insert BEFORE the real CSRFMiddleware so the cookie is set on the response
# before CSRF check runs on the next request. Actually CSRFMiddleware checks
# incoming requests, not outgoing responses, so order doesn't matter for the
# check - but we need the cookie set on responses so the browser stores it.
# Just add it to the stack - FastAPI will run it.
app.add_middleware(E2ETestCSRFMiddleware)

# Also patch the CSRF check to accept our test token when TEST_BYPASS_AUTH is active.
# The real CSRFMiddleware checks: header x-csrf-token == cookie csrf_token
# Our E2ETestCSRFMiddleware sets cookie = "e2e-test-csrf-token", so frontend
# will send X-CSRF-Token: e2e-test-csrf-token, and the check passes.
# No prod code changes needed.
