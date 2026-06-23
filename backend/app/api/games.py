from __future__ import annotations
import secrets, hashlib, re
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session
from .. import models, schemas
from ..db import get_db
from ..auth import require_user, require_membership
from ..tagging import classify_sentiment
from ..pairing import generate_groups

router = APIRouter()

def slugify(name: str) -> str:
    import re as _re
    s = _re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return s or "game"

def validate_discord_id(snowflake: str):
    if not re.match(r'^\d{17,20}$', snowflake):
        raise HTTPException(400, "Invalid Discord ID format")
    # snowflake timestamp check
    try:
        sid = int(snowflake)
        ts = ((sid >> 22) + 1420070400000) / 1000
        now = datetime.utcnow().timestamp()
        if ts < 1420070400 or ts > now + 86400:
            raise HTTPException(400, "That doesn't look like a Discord ID — see https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID")
    except ValueError:
        raise HTTPException(400, "Invalid Discord ID")

@router.post("/api/games", response_model=schemas.GameOut)
def create_game(payload: schemas.GameCreate, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    base = slugify(payload.name)
    for _ in range(5):
        slug = f"{base}-{secrets.token_urlsafe(6).lower().replace('_','').replace('-','')[:8]}"
        exists = db.query(models.Game).filter(models.Game.slug == slug).first()
        if not exists:
            break
    else:
        raise HTTPException(500, "slug collision")
    game = models.Game(slug=slug, name=payload.name, owner_discord_id=user.discord_id)
    db.add(game)
    db.commit()
    db.refresh(game)
    mem = models.GameMembership(game_id=game.id, discord_id=user.discord_id, role="owner")
    db.add(mem)
    db.add(models.ConnState(game_id=game.id, current_round=1))
    db.commit()
    return game

@router.get("/api/games")
def list_games(db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    memberships = db.query(models.GameMembership, models.Game).join(models.Game, models.GameMembership.game_id == models.Game.id).filter(models.GameMembership.discord_id == user.discord_id).all()
    return [{"game_id": m.GameMembership.game_id, "slug": m.Game.slug, "name": m.Game.name, "role": m.GameMembership.role, "archived_at": m.Game.archived_at} for m in memberships]

@router.get("/api/games/{game_id}", response_model=schemas.GameOut)
def get_game(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(404)
    return game

@router.patch("/api/games/{game_id}")
def rename_game(game_id: int, payload: dict, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    mem = require_membership(game_id, user.discord_id, db)
    if mem.role != "owner":
        raise HTTPException(403)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    name = payload.get("name")
    if name:
        game.name = name
        db.commit()
    return {"ok": True}

# Members
@router.get("/api/games/{game_id}/members")
def list_members(game_id: int, include_deleted: bool = False, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    q = db.query(models.GameMember).filter(models.GameMember.game_id == game_id)
    if not include_deleted:
        q = q.filter(models.GameMember.deleted_at.is_(None))
    return q.order_by(models.GameMember.sort_order).all()

@router.post("/api/games/{game_id}/members")
def create_member(game_id: int, payload: schemas.MemberCreate, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    if payload.discord_id:
        validate_discord_id(payload.discord_id)
    m = models.GameMember(game_id=game_id, name=payload.name, discord_id=payload.discord_id)
    db.add(m)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Name or Discord ID already in use")
    db.refresh(m)
    regenerate_pairings(db, game_id)
    return m

@router.patch("/api/games/{game_id}/members/{member_id}")
def patch_member(game_id: int, member_id: int, payload: schemas.MemberPatch, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    m = db.query(models.GameMember).filter(models.GameMember.id == member_id, models.GameMember.game_id == game_id).first()
    if not m:
        raise HTTPException(404)
    if payload.name is not None:
        m.name = payload.name
    if "discord_id" in payload.model_dump(exclude_unset=True):
        if payload.discord_id:
            validate_discord_id(payload.discord_id)
        m.discord_id = payload.discord_id
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Name or Discord ID conflict")
    regenerate_pairings(db, game_id)
    return m

@router.delete("/api/games/{game_id}/members/{member_id}")
def delete_member(game_id: int, member_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    m = db.query(models.GameMember).filter(models.GameMember.id == member_id, models.GameMember.game_id == game_id).first()
    if not m:
        raise HTTPException(404)
    m.deleted_at = datetime.utcnow()
    db.commit()
    regenerate_pairings(db, game_id)
    return {"ok": True}

@router.post("/api/games/{game_id}/members/{member_id}/restore")
def restore_member(game_id: int, member_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    m = db.query(models.GameMember).filter(models.GameMember.id == member_id, models.GameMember.game_id == game_id).first()
    if not m:
        raise HTTPException(404)
    m.deleted_at = None
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Name conflict")
    regenerate_pairings(db, game_id)
    return m

# Claim
@router.get("/api/games/{game_id}/members/unclaimed")
def unclaimed_members(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    rows = db.query(models.GameMember).filter(
        models.GameMember.game_id == game_id,
        models.GameMember.deleted_at.is_(None),
        models.GameMember.discord_id.is_(None)
    ).all()
    return [{"id": r.id, "name": r.name} for r in rows]

@router.post("/api/games/{game_id}/members/claim")
def claim_member(game_id: int, payload: schemas.ClaimRequest, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    if bool(payload.member_id) == bool(payload.name):
        raise HTTPException(400, "provide member_id XOR name")
    if payload.member_id:
        m = db.query(models.GameMember).filter(models.GameMember.id == payload.member_id, models.GameMember.game_id == game_id, models.GameMember.deleted_at.is_(None)).first()
        if not m:
            raise HTTPException(404)
        if m.discord_id is not None:
            raise HTTPException(400, "already claimed")
        m.discord_id = user.discord_id
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(400, "Discord ID already claimed in this game")
        return {"member_id": m.id, "name": m.name, "discord_id": m.discord_id}
    else:
        m = models.GameMember(game_id=game_id, name=payload.name, discord_id=user.discord_id)
        db.add(m)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(400, "Name already in use")
        db.refresh(m)
        regenerate_pairings(db, game_id)
        return {"member_id": m.id, "name": m.name, "discord_id": m.discord_id}

# Questions
@router.get("/api/games/{game_id}/questions")
def list_questions(game_id: int, status: str = "upcoming", db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    rows = db.query(models.ConnQuestion).filter(models.ConnQuestion.game_id == game_id, models.ConnQuestion.status == status).order_by(models.ConnQuestion.sort_order).all()
    return rows

@router.post("/api/games/{game_id}/questions")
def create_question(game_id: int, payload: schemas.QuestionCreate, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    max_sort = db.query(models.ConnQuestion.sort_order).filter(models.ConnQuestion.game_id == game_id, models.ConnQuestion.status == "upcoming").order_by(models.ConnQuestion.sort_order.desc()).first()
    sort_order = (max_sort[0] + 1) if max_sort else 0
    tag = classify_sentiment(payload.text)
    q = models.ConnQuestion(game_id=game_id, text=payload.text, tag=tag, tag_auto=True, status="upcoming", sort_order=sort_order)
    db.add(q)
    db.commit()
    db.refresh(q)
    return {"question_id": q.id, "tag": q.tag, "tag_auto": True}

@router.patch("/api/games/{game_id}/questions/{qid}")
def patch_question(game_id: int, qid: int, payload: schemas.QuestionPatch, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if not q:
        raise HTTPException(404)
    old_text, old_tag = q.text, q.tag
    changed = False
    # record edit if text or tag changes
    new_text = payload.text if payload.text is not None else q.text
    new_tag = q.tag
    new_tag_auto = q.tag_auto
    if payload.tag_auto is not None:
        new_tag_auto = payload.tag_auto
    if payload.tag is not None:
        new_tag = payload.tag
        # manual tag override sets tag_auto=0 unless explicitly passed
        if payload.tag_auto is None:
            new_tag_auto = False
    if payload.text is not None and payload.text != q.text:
        changed = True
        new_text = payload.text
        if new_tag_auto:  # reclassify if auto
            new_tag = classify_sentiment(new_text)
    # if tag_auto being set to True, re-classify immediately
    if payload.tag_auto is True and (payload.tag is None):
        new_tag_auto = True
        new_tag = classify_sentiment(new_text)
    if new_text != q.text or new_tag != q.tag:
        edit = models.ConnQuestionEdit(question_id=q.id, old_text=q.text, old_tag=q.tag, edited_by=user.discord_id, edited_at=datetime.utcnow())
        db.add(edit)
        changed = True
    q.text = new_text
    q.tag = new_tag
    q.tag_auto = new_tag_auto
    q.updated_at = datetime.utcnow()
    db.commit()
    return q

@router.get("/api/games/{game_id}/questions/{qid}/history")
def question_history(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    rows = db.query(models.ConnQuestionEdit).filter(models.ConnQuestionEdit.question_id == qid).order_by(models.ConnQuestionEdit.edited_at).all()
    return rows

@router.post("/api/games/{game_id}/questions/{qid}/graveyard")
def graveyard_question(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if q:
        q.status = "graveyard"
        db.commit()
    return {"ok": True}

@router.post("/api/games/{game_id}/questions/{qid}/restore")
def restore_question(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if not q:
        raise HTTPException(404)
    max_sort = db.query(models.ConnQuestion.sort_order).filter(models.ConnQuestion.game_id == game_id, models.ConnQuestion.status == "upcoming").order_by(models.ConnQuestion.sort_order.desc()).first()
    q.sort_order = (max_sort[0] + 1) if max_sort else 0
    q.status = "upcoming"
    if q.tag_auto:
        q.tag = classify_sentiment(q.text)
    db.commit()
    return {"ok": True}

@router.delete("/api/games/{game_id}/questions/{qid}")
def delete_question(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if q:
        db.delete(q)
        db.commit()
    return {"ok": True}

@router.post("/api/games/{game_id}/questions/reorder")
def reorder_questions(game_id: int, payload: schemas.ReorderRequest, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    for i, qid in enumerate(payload.question_ids):
        db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).update({"sort_order": i})
    db.commit()
    return {"ok": True}

# Round
@router.get("/api/games/{game_id}/round")
def get_round(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    state = db.query(models.ConnState).filter(models.ConnState.game_id == game_id).first()
    if not state:
        state = models.ConnState(game_id=game_id, current_round=1)
        db.add(state)
        db.commit()
    round_num = state.current_round
    pairings = db.query(models.ConnPairing, models.GameMember).join(models.GameMember, models.ConnPairing.target_member_id == models.GameMember.id).filter(models.ConnPairing.game_id == game_id, models.ConnPairing.round_num == round_num).all()
    # need asker names too
    pairs = db.query(models.ConnPairing).filter(models.ConnPairing.game_id == game_id, models.ConnPairing.round_num == round_num).all()
    member_map = {m.id: m for m in db.query(models.GameMember).filter(models.GameMember.game_id == game_id).all()}
    out_pairs = []
    for p in pairs:
        asker = member_map.get(p.asker_member_id)
        target = member_map.get(p.target_member_id)
        if asker and target:
            out_pairs.append({"asker_id": asker.id, "asker_name": asker.name, "asker_discord_id": asker.discord_id, "target_id": target.id, "target_name": target.name, "target_discord_id": target.discord_id})
    question = None
    if state.current_question_id:
        question = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == state.current_question_id).first()
    if not question:
        question = db.query(models.ConnQuestion).filter(models.ConnQuestion.game_id == game_id, models.ConnQuestion.status == "upcoming").order_by(models.ConnQuestion.sort_order).first()
        if question:
            state.current_question_id = question.id
            db.commit()
    return {"round_num": round_num, "question": question, "pairings": out_pairs}

@router.post("/api/games/{game_id}/round/complete")
def complete_round(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    state = db.query(models.ConnState).filter(models.ConnState.game_id == game_id).first()
    if not state:
        raise HTTPException(400, "no state")
    round_num = state.current_round
    play = models.ConnPlay(game_id=game_id, round_num=round_num, question_id=state.current_question_id, played_by=user.discord_id)
    db.add(play)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "round already completed")
    # mark question used
    if state.current_question_id:
        q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == state.current_question_id).first()
        if q:
            q.status = "used"
    # advance
    state.current_round += 1
    # next question
    nq = db.query(models.ConnQuestion).filter(models.ConnQuestion.game_id == game_id, models.ConnQuestion.status == "upcoming").order_by(models.ConnQuestion.sort_order).first()
    state.current_question_id = nq.id if nq else None
    state.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "next_round": state.current_round}

def regenerate_pairings(db: Session, game_id: int):
    members = db.query(models.GameMember).filter(models.GameMember.game_id == game_id, models.GameMember.deleted_at.is_(None)).order_by(models.GameMember.id).all()
    member_ids = [m.id for m in members]
    if len(member_ids) < 3:
        db.query(models.ConnPairing).filter(models.ConnPairing.game_id == game_id).delete()
        db.commit()
        return
    # delete future pairings only? spec says regenerate automatically, past rounds immutable.
    # For simplicity, delete all and regenerate – need to preserve played rounds.
    state = db.query(models.ConnState).filter(models.ConnState.game_id == game_id).first()
    current_round = state.current_round if state else 1
    # delete unplayed rounds
    db.query(models.ConnPairing).filter(models.ConnPairing.game_id == game_id, models.ConnPairing.round_num >= current_round).delete()
    db.commit()
    groups = generate_groups(member_ids)
    # insert only future rounds, offset by current_round-1
    existing_rounds = db.query(models.ConnPairing.round_num).filter(models.ConnPairing.game_id == game_id).distinct().count()
    start_round = current_round
    for idx, pairings in enumerate(groups):
        round_num = start_round + idx
        # stop if we'd overwrite a played round – we already deleted >= current_round
        for asker_id, target_id in pairings:
            db.add(models.ConnPairing(game_id=game_id, round_num=round_num, asker_member_id=asker_id, target_member_id=target_id))
    db.commit()

# ---- Join / Invites / Admin / Archive / Backup / History / Pairings ----

from fastapi.responses import StreamingResponse
import os, sqlite3, tempfile

def require_owner(game_id: int, discord_id: str, db: Session):
    mem = require_membership(game_id, discord_id, db)
    if mem.role != "owner":
        raise HTTPException(403, "owner only")
    return mem

@router.post("/api/games/join")
def join_game(payload: schemas.JoinRequest, request: Request, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    # rate limiting enforced in middleware
    token_hash = hashlib.sha256(payload.invite_token.encode()).hexdigest()
    invite = db.query(models.GameInvite).filter(models.GameInvite.token_hash == token_hash).first()
    now = datetime.utcnow()
    if not invite or invite.revoked_at or invite.used_at or invite.expires_at < now:
        raise HTTPException(403, "invalid or expired invite")
    game_id = invite.game_id
    # grant membership if not already
    existing = db.query(models.GameMembership).filter(models.GameMembership.game_id == game_id, models.GameMembership.discord_id == user.discord_id).first()
    if not existing:
        db.add(models.GameMembership(game_id=game_id, discord_id=user.discord_id, role="admin", joined_at=now))
    invite.used_by = user.discord_id
    invite.used_at = now
    db.commit()
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    # check claim_needed
    claimed = db.query(models.GameMember).filter(
        models.GameMember.game_id == game_id,
        models.GameMember.deleted_at.is_(None),
        models.GameMember.discord_id == user.discord_id
    ).first()
    claim_needed = claimed is None
    unclaimed = []
    if claim_needed:
        rows = db.query(models.GameMember).filter(
            models.GameMember.game_id == game_id,
            models.GameMember.deleted_at.is_(None),
            models.GameMember.discord_id.is_(None)
        ).all()
        unclaimed = [{"id": r.id, "name": r.name} for r in rows]
    return {"game_id": game_id, "slug": game.slug if game else None, "claim_needed": claim_needed, "unclaimed_members": unclaimed}

@router.post("/api/games/{game_id}/invites")
def create_invite(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_owner(game_id, user.discord_id, db)
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.utcnow()
    invite = models.GameInvite(
        token_hash=token_hash,
        game_id=game_id,
        created_by=user.discord_id,
        created_at=now,
        expires_at=now + timedelta(days=7)
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {"id": invite.id, "invite_token": token, "expires_at": invite.expires_at.isoformat()}

@router.get("/api/games/{game_id}/invites")
def list_invites(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_owner(game_id, user.discord_id, db)
    rows = db.query(models.GameInvite).filter(models.GameInvite.game_id == game_id).order_by(models.GameInvite.created_at.desc()).all()
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "token_prefix": r.token_hash[:6],
            "created_at": r.created_at,
            "expires_at": r.expires_at,
            "used_by": r.used_by,
            "used_at": r.used_at,
            "revoked_at": r.revoked_at,
        })
    return out

@router.delete("/api/games/{game_id}/invites/{invite_id}")
def revoke_invite(game_id: int, invite_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_owner(game_id, user.discord_id, db)
    inv = db.query(models.GameInvite).filter(models.GameInvite.id == invite_id, models.GameInvite.game_id == game_id).first()
    if not inv:
        raise HTTPException(404)
    inv.revoked_at = datetime.utcnow()
    db.commit()
    return {"ok": True}

@router.post("/api/games/{game_id}/archive")
def archive_game(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_owner(game_id, user.discord_id, db)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(404)
    game.archived_at = datetime.utcnow()
    db.commit()
    return {"ok": True}

@router.post("/api/games/{game_id}/unarchive")
def unarchive_game(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_owner(game_id, user.discord_id, db)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(404)
    game.archived_at = None
    db.commit()
    return {"ok": True}

@router.get("/api/games/{game_id}/admins")
def list_admins(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_owner(game_id, user.discord_id, db)
    rows = db.query(models.GameMembership, models.DiscordUser).join(
        models.DiscordUser, models.GameMembership.discord_id == models.DiscordUser.discord_id
    ).filter(models.GameMembership.game_id == game_id).all()
    return [{"discord_id": m.GameMembership.discord_id, "role": m.GameMembership.role, "joined_at": m.GameMembership.joined_at, "username": m.DiscordUser.username, "global_name": m.DiscordUser.global_name} for m in rows]

@router.delete("/api/games/{game_id}/admins/{discord_id}")
def revoke_admin(game_id: int, discord_id: str, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_owner(game_id, user.discord_id, db)
    if discord_id == user.discord_id:
        raise HTTPException(400, "cannot revoke yourself")
    mem = db.query(models.GameMembership).filter(models.GameMembership.game_id == game_id, models.GameMembership.discord_id == discord_id).first()
    if mem:
        db.delete(mem)
    # unclaim game_members for that user
    members = db.query(models.GameMember).filter(models.GameMember.game_id == game_id, models.GameMember.discord_id == discord_id).all()
    for m in members:
        m.discord_id = None
    db.commit()
    return {"ok": True}

@router.get("/api/games/{game_id}/backup")
def backup_game(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_owner(game_id, user.discord_id, db)
    # stream SQLite backup
    db_path = os.environ.get("CONNECTIONS_DB_PATH", "/data/connections.db")
    # fallback to local dev path
    if not os.path.exists(db_path):
        alt = os.path.join(os.path.dirname(__file__), "..", "..", "connections.db")
        if os.path.exists(alt):
            db_path = alt
    def generate():
        src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        with tempfile.NamedTemporaryFile(delete=False) as tf:
            tmp_path = tf.name
        try:
            dst = sqlite3.connect(tmp_path)
            src.backup(dst)
            dst.close()
            src.close()
            with open(tmp_path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    yield chunk
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    today = datetime.utcnow().strftime("%Y-%m-%d")
    headers = {"Content-Disposition": f'attachment; filename="connections-backup-{today}.db"'}
    return StreamingResponse(generate(), media_type="application/octet-stream", headers=headers)

@router.get("/api/games/{game_id}/history")
def game_history(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    plays = db.query(models.ConnPlay, models.ConnQuestion).outerjoin(
        models.ConnQuestion, models.ConnPlay.question_id == models.ConnQuestion.id
    ).filter(models.ConnPlay.game_id == game_id).order_by(models.ConnPlay.round_num.desc()).all()
    out = []
    for play, q in plays:
        out.append({
            "round_num": play.round_num,
            "played_at": play.played_at,
            "played_by": play.played_by,
            "question_id": play.question_id,
            "question_text": q.text if q else None,
        })
    return out

@router.get("/api/games/{game_id}/pairings")
def get_pairings(game_id: int, round: int = None, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    if round is None:
        state = db.query(models.ConnState).filter(models.ConnState.game_id == game_id).first()
        round = state.current_round if state else 1
    pairs = db.query(models.ConnPairing).filter(models.ConnPairing.game_id == game_id, models.ConnPairing.round_num == round).all()
    member_map = {m.id: m for m in db.query(models.GameMember).filter(models.GameMember.game_id == game_id).all()}
    out = []
    for p in pairs:
        asker = member_map.get(p.asker_member_id)
        target = member_map.get(p.target_member_id)
        if asker and target:
            out.append({
                "asker_id": asker.id, "asker_name": asker.name, "asker_discord_id": asker.discord_id,
                "target_id": target.id, "target_name": target.name, "target_discord_id": target.discord_id
            })
    return {"round_num": round, "pairings": out}

# ensure require_membership is called on every endpoint – audit above: yes
