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
from app.db import get_db
from app.auth import require_user
from app import models
from fastapi import Depends
from sqlalchemy.orm import Session


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

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
