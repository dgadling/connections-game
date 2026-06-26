from __future__ import annotations
import secrets
import hashlib
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from .. import models, schemas
from ..db import get_db
from ..auth import require_user
from ..timeutil import utcnow, serialize_datetime
from .common import require_game_admin, require_game_writable

router = APIRouter(prefix="/api/games", tags=["invites"])


@router.post("/join")
def join_game(payload: schemas.JoinRequest, request: Request, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    # rate limiting enforced in middleware
    token_hash = hashlib.sha256(payload.invite_token.encode()).hexdigest()
    invite = db.query(models.GameInvite).filter(models.GameInvite.token_hash == token_hash).first()
    now = utcnow()
    if not invite or invite.expires_at < now:
        raise HTTPException(403, "invalid or expired invite")
    game_id = invite.game_id
    require_game_writable(game_id, db)
    existing = db.query(models.GameMembership).filter(models.GameMembership.game_id == game_id, models.GameMembership.discord_id == user.discord_id).first()
    if not existing:
        db.add(models.GameMembership(game_id=game_id, discord_id=user.discord_id))
    db.delete(invite)
    db.commit()
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    return {"game_id": game_id, "name": game.name if game else "", "archived_at": serialize_datetime(game.archived_at) if game else None}


@router.post("/{game_id}/invites")
def create_invite(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    token = secrets.token_urlsafe(12)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = utcnow()
    invite = models.GameInvite(
        token_hash=token_hash,
        game_id=game_id,
        created_by=user.discord_id,
        created_at=now,
        expires_at=now + timedelta(days=1)
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {"id": invite.id, "invite_token": token, "expires_at": serialize_datetime(invite.expires_at)}


@router.get("/{game_id}/invites")
def list_invites(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    now = utcnow()
    # delete expired rows for this game
    db.query(models.GameInvite).filter(
        models.GameInvite.game_id == game_id,
        models.GameInvite.expires_at < now
    ).delete(synchronize_session=False)
    db.commit()
    rows = db.query(models.GameInvite).filter(models.GameInvite.game_id == game_id).order_by(models.GameInvite.created_at.desc()).all()
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "token_prefix": r.token_hash[:6],
            "created_at": serialize_datetime(r.created_at),
            "expires_at": serialize_datetime(r.expires_at),
        })
    return out


@router.delete("/{game_id}/invites/{invite_id}")
def revoke_invite(game_id: int, invite_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    inv = db.query(models.GameInvite).filter(models.GameInvite.id == invite_id, models.GameInvite.game_id == game_id).first()
    if not inv:
        raise HTTPException(404)
    db.delete(inv)
    db.commit()
    return {"ok": True}
