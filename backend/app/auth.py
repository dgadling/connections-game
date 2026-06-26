from __future__ import annotations
import os
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from .db import get_db
from . import models

SESSION_COOKIE = "connections_session"
CSRF_COOKIE = "csrf_token"
SESSION_SLIDING_DAYS = 30
SESSION_ABSOLUTE_DAYS = 90

# Cookie security attributes - keep in sync with app/main.py
# OAuth state cookie uses SameSite=None to allow cross-site redirects
# from Discord (mobile Safari drops Lax cookies). SameSite=None REQUIRES Secure=True,
# otherwise it's a CSRF vector - startup assert enforces this in prod.
SESSION_COOKIE_ATTRS = {"httponly": True, "secure": True, "samesite": "lax"}
CSRF_COOKIE_ATTRS = {"httponly": False, "secure": True, "samesite": "strict"}
OAUTH_STATE_COOKIE = "oauth_state"
OAUTH_STATE_COOKIE_ATTRS = {"httponly": True, "secure": True, "samesite": "none"}

# Global superuser - has owner access to all games
# Read at module load, but is_superuser() also checks os.environ for test overrides
SUPERUSER_DISCORD_ID = os.environ.get("SUPERUSER_DISCORD_ID", "")


def is_superuser(discord_id: str) -> bool:
    """Check if discord_id matches the configured superuser."""
    # Check env var dynamically to allow test overrides that set os.environ
    # after module import (pytest conftest loads app.auth early)
    superuser_id = os.environ.get("SUPERUSER_DISCORD_ID") or SUPERUSER_DISCORD_ID
    return bool(superuser_id and discord_id == superuser_id)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def get_session_token(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE)

def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.DiscordUser | None:
    token = get_session_token(request)
    if not token:
        return None
    token_hash = hash_token(token)
    sess = db.query(models.AuthSession).filter(models.AuthSession.session_token_hash == token_hash).first()
    if not sess:
        return None
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if sess.expires_at < now or sess.absolute_expires_at < now:
        db.delete(sess)
        db.commit()
        return None
    # sliding refresh
    sess.expires_at = now + timedelta(days=SESSION_SLIDING_DAYS)
    sess.last_used_at = now
    db.commit()
    user = db.query(models.DiscordUser).filter(models.DiscordUser.discord_id == sess.discord_id).first()
    if user:
        user.last_seen = now
        db.commit()
    return user

def require_user(request: Request, db: Session = Depends(get_db)) -> models.DiscordUser:
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(401, "not authenticated")
    return user

def require_membership(game_id: int, discord_id: str, db: Session):
    # Superuser bypass - has access to all games
    if is_superuser(discord_id):
        # Return a fake membership object with owner role
        from types import SimpleNamespace
        return SimpleNamespace(role="owner", discord_id=discord_id, game_id=game_id)
    mem = db.query(models.GameMembership).filter(
        models.GameMembership.game_id == game_id,
        models.GameMembership.discord_id == discord_id
    ).first()
    if not mem:
        raise HTTPException(403, "not a member of this game")
    return mem

def create_session(db: Session, discord_id: str) -> str:
    # invalidate existing sessions for this discord_id? spec says invalidate any existing session at OAuth login - do that in oauth callback, not here
    token = secrets.token_urlsafe(32)
    token_hash = hash_token(token)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    sess = models.AuthSession(
        session_token_hash=token_hash,
        discord_id=discord_id,
        created_at=now,
        expires_at=now + timedelta(days=SESSION_SLIDING_DAYS),
        absolute_expires_at=now + timedelta(days=SESSION_ABSOLUTE_DAYS),
        last_used_at=now,
    )
    db.add(sess)
    db.commit()
    return token

DISCORD_CLIENT_ID = os.environ["DISCORD_CLIENT_ID"]
DISCORD_CLIENT_SECRET = os.environ["DISCORD_CLIENT_SECRET"]
REDIRECT_URI = os.environ["DISCORD_REDIRECT_URI"]
SESSION_SECRET = os.environ["SESSION_SECRET"]


def generate_csrf_token(session_token: str) -> str:
    """Generate CSRF token bound to session via HMAC.

    Prevents subdomain cookie injection attacks where an attacker
    who can set cookies on a sibling subdomain could otherwise
    forge a CSRF token (classic double-submit weakness).
    """
    import hmac
    # Use SESSION_SECRET as CSRF HMAC key - fail hard if missing,
    # consistent with DISCORD_OAUTH_FERNET_KEY handling.
    secret = SESSION_SECRET.encode()
    if not secret:
        raise RuntimeError("SESSION_SECRET must be set (used for CSRF HMAC)")
    return hmac.new(secret, session_token.encode(), hashlib.sha256).hexdigest()

def discord_oauth_url(state: str, prompt_none: bool = True) -> str:
    from urllib.parse import urlencode
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "identify",
        "state": state,
    }
    if prompt_none:
        params["prompt"] = "none"
    return "https://discord.com/oauth2/authorize?" + urlencode(params)


async def refresh_discord_token(db: Session, discord_id: str) -> str | None:
    """Refresh a Discord OAuth access token for the given discord_id.

    Returns new access_token on success, None on failure (and deletes token row).
    """
    from .crypto import decrypt_token, encrypt_token
    import httpx

    token_row = db.query(models.DiscordOAuthToken).filter(
        models.DiscordOAuthToken.discord_id == discord_id
    ).first()
    if not token_row:
        return None

    try:
        refresh_token = decrypt_token(token_row.refresh_token_encrypted)
    except Exception:
        db.delete(token_row)
        db.commit()
        return None

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://discord.com/api/oauth2/token",
            data={
                "client_id": DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            # invalid_grant etc - delete token row
            db.delete(token_row)
            db.commit()
            return None
        data = token_resp.json()
        new_access_token = data.get("access_token")
        new_refresh_token = data.get("refresh_token", refresh_token)
        expires_in = data.get("expires_in", 604800)
        if not new_access_token:
            db.delete(token_row)
            db.commit()
            return None

    # update DB
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    token_row.access_token_encrypted = encrypt_token(new_access_token)
    token_row.refresh_token_encrypted = encrypt_token(new_refresh_token)
    token_row.expires_at = now + timedelta(seconds=expires_in)
    token_row.updated_at = now
    db.commit()
    return new_access_token
