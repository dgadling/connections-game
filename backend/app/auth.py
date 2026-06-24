from __future__ import annotations
import os
import secrets
import hashlib
from datetime import datetime, timedelta
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from .db import get_db
from . import models

SESSION_COOKIE = "connections_session"
CSRF_COOKIE = "csrf_token"
SESSION_SLIDING_DAYS = 30
SESSION_ABSOLUTE_DAYS = 90

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
    now = datetime.utcnow()
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
    now = datetime.utcnow()
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

def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)

DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID", "1519114145864356001")
DISCORD_CLIENT_SECRET = os.environ.get("DISCORD_CLIENT_SECRET", "")
if not DISCORD_CLIENT_SECRET:
    try:
        with open(os.path.expanduser("~/workspace/.auth/discord_oauth_client_secret"), "r") as f:
            DISCORD_CLIENT_SECRET = f.read().strip()
    except Exception:
        pass

REDIRECT_URI = os.environ.get("DISCORD_REDIRECT_URI", "https://connections-285405137493.us-central1.run.app/auth/discord/callback")

def discord_oauth_url(state: str) -> str:
    from urllib.parse import urlencode
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "identify",
        "state": state,
    }
    return "https://discord.com/api/oauth2/authorize?" + urlencode(params)
