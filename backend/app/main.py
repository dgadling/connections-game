from __future__ import annotations
import os
import secrets
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import httpx

from .db import get_db
from . import models
from .auth import (
    require_user,
    create_session, hash_token,
    generate_csrf_token, CSRF_COOKIE, SESSION_COOKIE,
    discord_oauth_url,
    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI,
)
from .api.games import router as games_router
from .middleware import CSRFMiddleware

# Create tables on startup (Alembic will handle migrations in prod)
# Base.metadata.create_all(bind=engine)

app = FastAPI(title="Connections Game")

# CSRF + rate limiting middleware
app.add_middleware(CSRFMiddleware)

@app.middleware("http")
async def csrf_cookie_middleware(request: Request, call_next):
    response = await call_next(request)
    # Ensure CSRF cookie is set for authenticated sessions
    if request.cookies.get(SESSION_COOKIE) and not request.cookies.get(CSRF_COOKIE):
        response.set_cookie(
            CSRF_COOKIE, generate_csrf_token(),
            httponly=False, secure=True, samesite="lax", path="/"
        )
    return response

# Auth routes
@app.post("/auth/discord/start")
async def auth_discord_start(request: Request, db: Session = Depends(get_db), redirect_after: str = "/"):
    # Validate redirect_after - same-origin path only
    if "://" in redirect_after or redirect_after.startswith("//"):
        redirect_after = "/"
    if not redirect_after.startswith("/"):
        redirect_after = "/"
    state = secrets.token_urlsafe(32)
    oauth_state = models.OAuthState(
        state_token=state,
        redirect_after=redirect_after,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(oauth_state)
    db.commit()
    resp = JSONResponse({"auth_url": discord_oauth_url(state)})
    resp.set_cookie("oauth_state", state, max_age=600, httponly=True, secure=True, samesite="none", path="/")
    return resp

@app.get("/auth/discord/callback")
async def auth_discord_callback(request: Request, code: str, state: str, db: Session = Depends(get_db)):
    # Verify state - DB is authoritative CSRF protection (single-use, 10min expiry)
    # Cookie is defense-in-depth only - don't fail if missing (mobile Safari drops cross-site Lax cookies)
    import logging
    logger = logging.getLogger("uvicorn")
    cookie_state = request.cookies.get("oauth_state")
    if not cookie_state or cookie_state != state:
        logger.warning(f"OAuth state cookie mismatch: cookie={cookie_state!r} param={state!r} - continuing with DB validation")
    oauth_state = db.query(models.OAuthState).filter(models.OAuthState.state_token == state).first()
    if not oauth_state or oauth_state.expires_at < datetime.utcnow():
        raise HTTPException(400, "OAuth state expired")
    # consume state
    redirect_after = oauth_state.redirect_after or "/"
    db.delete(oauth_state)
    db.commit()
    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://discord.com/api/oauth2/token",
            data={
                "client_id": DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            raise HTTPException(400, "OAuth token exchange failed")
        access_token = token_resp.json()["access_token"]
        # Get user info
        user_resp = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise HTTPException(400, "Failed to fetch Discord user")
        du = user_resp.json()
    discord_id = du["id"]
    username = du["username"]
    global_name = du.get("global_name")
    avatar_hash = du.get("avatar")
    # Upsert discord_user
    user = db.query(models.DiscordUser).filter(models.DiscordUser.discord_id == discord_id).first()
    now = datetime.utcnow()
    if user:
        user.username = username
        user.global_name = global_name
        user.avatar_hash = avatar_hash
        user.last_seen = now
    else:
        user = models.DiscordUser(
            discord_id=discord_id,
            username=username,
            global_name=global_name,
            avatar_hash=avatar_hash,
            last_seen=now,
            created_at=now,
        )
        db.add(user)
    db.commit()
    # Session fixation protection - invalidate all existing sessions for this discord_id
    db.query(models.AuthSession).filter(models.AuthSession.discord_id == discord_id).delete()
    db.commit()
    # Create new session
    session_token = create_session(db, discord_id)
    csrf_token = generate_csrf_token()
    # Redirect with cookies
    resp = RedirectResponse(url=redirect_after, status_code=302)
    resp.set_cookie(SESSION_COOKIE, session_token, max_age=30*86400, httponly=True, secure=True, samesite="lax", path="/")
    resp.set_cookie(CSRF_COOKIE, csrf_token, max_age=30*86400, httponly=False, secure=True, samesite="lax", path="/")
    resp.delete_cookie("oauth_state", path="/")
    return resp

@app.post("/auth/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    from .auth import get_session_token
    token = get_session_token(request)
    if token:
        token_hash = hash_token(token)
        sess = db.query(models.AuthSession).filter(models.AuthSession.session_token_hash == token_hash).first()
        if sess:
            db.delete(sess)
            db.commit()
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE, path="/")
    resp.delete_cookie(CSRF_COOKIE, path="/")
    return resp

@app.get("/auth/me")
def auth_me(user: models.DiscordUser = Depends(require_user)):
    return {
        "discord_id": user.discord_id,
        "username": user.username,
        "global_name": user.global_name,
        "avatar_hash": user.avatar_hash,
    }

# Health check
@app.get("/healthz")
def healthz(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(503, "db unavailable") from e

# Privacy policy
@app.get("/privacy")
def privacy():
    # Serve static file if exists, else inline
    import os
    privacy_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "privacy.html")
    if os.path.exists(privacy_path):
        return FileResponse(privacy_path)
    return HTMLResponse("""
<!doctype html><html><head><meta charset=utf-8><title>Privacy Policy — Connections Game</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Privacy Policy — Connections Game</h1>
<p>We store your Discord ID, Discord username, global display name, and avatar hash — public profile data from Discord's <code>identify</code> scope, nothing else.</p>
<p>Game content (member names, questions, pairing history) is visible only to admins of that specific game. Admins for one game cannot access data from games they are not members of.</p>
<p>We do not share, sell, or transfer your data to third parties.</p>
<p>To delete your account data, contact dave@toasterwaffles.com.</p>
<p><em>Last updated: 2026-06-23</em></p>
</body></html>
""")

# API routes
app.include_router(games_router)

# Serve React frontend (if built)
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
