from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..db import get_db
from ..auth import require_user, require_membership
from ..timeutil import utcnow
from ..pairing import generate_groups
from .common import require_game_writable

router = APIRouter(prefix="/api/games/{game_id}/members", tags=["members"])


def regenerate_pairings(db: Session, game_id: int):
    members = db.query(models.GameMember).filter(models.GameMember.game_id == game_id, models.GameMember.deleted_at.is_(None)).order_by(models.GameMember.id).all()
    member_ids = [m.id for m in members]
    if len(member_ids) < 3:
        db.query(models.ConnPairing).filter(models.ConnPairing.game_id == game_id).delete()
        db.commit()
        return
    state = db.query(models.ConnState).filter(models.ConnState.game_id == game_id).first()
    current_round = state.current_round if state else 1
    # Preserve current round pairings - only regenerate future rounds
    # (prevents pairings shuffling under you mid-round when roster changes)
    db.query(models.ConnPairing).filter(
        models.ConnPairing.game_id == game_id,
        models.ConnPairing.round_num > current_round
    ).delete()
    db.commit()
    groups = generate_groups(member_ids)
    # Insert future rounds starting at current_round + 1
    start_round = current_round + 1
    for idx, pairings in enumerate(groups):
        round_num = start_round + idx
        for asker_id, target_id in pairings:
            db.add(models.ConnPairing(game_id=game_id, round_num=round_num, asker_member_id=asker_id, target_member_id=target_id))
    db.commit()


@router.get("", response_model=list[schemas.MemberListItem])
def list_members(game_id: int, include_deleted: bool = False, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    q = db.query(models.GameMember).filter(models.GameMember.game_id == game_id)
    if not include_deleted:
        q = q.filter(models.GameMember.deleted_at.is_(None))
    rows = q.order_by(models.GameMember.sort_order).all()
    return rows


@router.post("", response_model=schemas.MemberResponse)
def create_member(game_id: int, payload: schemas.MemberCreate, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    m = models.GameMember(game_id=game_id, name=payload.name, discord_id=payload.discord_id)
    db.add(m)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, "Name or Discord ID already in use") from e
    db.refresh(m)
    regenerate_pairings(db, game_id)
    return m


@router.patch("/{member_id}", response_model=schemas.MemberResponse)
def patch_member(game_id: int, member_id: int, payload: schemas.MemberPatch, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    m = db.query(models.GameMember).filter(models.GameMember.id == member_id, models.GameMember.game_id == game_id).first()
    if not m:
        raise HTTPException(404)
    if payload.name is not None:
        m.name = payload.name
    if "discord_id" in payload.model_dump(exclude_unset=True):
        m.discord_id = payload.discord_id
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, "Name or Discord ID conflict") from e
    regenerate_pairings(db, game_id)
    return m


@router.delete("/{member_id}", response_model=schemas.OkResponse)
def delete_member(game_id: int, member_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    m = db.query(models.GameMember).filter(models.GameMember.id == member_id, models.GameMember.game_id == game_id).first()
    if not m:
        raise HTTPException(404)
    m.deleted_at = utcnow()
    db.commit()
    regenerate_pairings(db, game_id)
    return schemas.OkResponse()


@router.post("/{member_id}/restore", response_model=schemas.MemberResponse)
def restore_member(game_id: int, member_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    m = db.query(models.GameMember).filter(models.GameMember.id == member_id, models.GameMember.game_id == game_id).first()
    if not m:
        raise HTTPException(404)
    m.deleted_at = None
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, "Name conflict") from e
    regenerate_pairings(db, game_id)
    return m
