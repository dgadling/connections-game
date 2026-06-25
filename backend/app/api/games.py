from __future__ import annotations
import secrets
import hashlib
import re
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from .. import models, schemas
from ..db import get_db
from ..auth import require_user, require_membership
from ..tagging import classify_sentiment
from ..pairing import generate_groups

router = APIRouter()

def validate_discord_id(discord_id: str) -> str:
    """Validate Discord snowflake OR username.
    Returns normalized ID (username without leading @, snowflake unchanged).
    """
    if not discord_id:
        raise HTTPException(400, "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)")
    if len(discord_id) > 64:
        raise HTTPException(400, "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)")
    # Strip leading @ for usernames
    normalized = discord_id.lstrip("@")
    if not normalized:
        raise HTTPException(400, "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)")
    # Numeric snowflake path (back-compat)
    if re.match(r'^\d{17,20}$', normalized):
        try:
            sid = int(normalized)
            ts = ((sid >> 22) + 1420070400000) / 1000
            now = datetime.now(timezone.utc).replace(tzinfo=None).timestamp()
            if ts < 1420070400 or ts > now + 86400:
                raise HTTPException(400, "That doesn't look like a Discord ID — see https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID")
        except ValueError as e:
            raise HTTPException(400, "Invalid Discord ID") from e
        return normalized
    # Username/handle path
    if re.match(r'^[\w.]{2,32}$', normalized):
        return normalized
    raise HTTPException(400, "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)")

@router.post("/api/games", response_model=schemas.GameOut)
def create_game(payload: schemas.GameCreate, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    from ..auth import is_superuser
    import os
    from ..auth import SUPERUSER_DISCORD_ID as _SU
    # If SUPERUSER_DISCORD_ID is configured, only superuser can create games.
    # If not configured (dev/test), allow anyone (backward compat).
    # Check env var dynamically to match is_superuser() test override behavior
    superuser_id = os.environ.get("SUPERUSER_DISCORD_ID") or _SU
    if superuser_id and not is_superuser(user.discord_id):
        raise HTTPException(403, "only superuser can create games")
    game = models.Game(name=payload.name, owner_discord_id=user.discord_id)
    db.add(game)
    db.commit()
    db.refresh(game)
    mem = models.GameMembership(game_id=game.id, discord_id=user.discord_id)
    db.add(mem)
    db.add(models.ConnState(game_id=game.id, current_round=1))
    db.commit()
    return game

@router.get("/api/games", response_model=list[schemas.GameOut])
def list_games(db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    from ..auth import is_superuser
    if is_superuser(user.discord_id):
        # Superuser sees all games
        games = db.query(models.Game).all()
        return games
    memberships = db.query(models.GameMembership, models.Game).join(models.Game, models.GameMembership.game_id == models.Game.id).filter(models.GameMembership.discord_id == user.discord_id).all()
    out = []
    for _mem, game in memberships:
        out.append(game)
    return out

@router.get("/api/games/{game_id}", response_model=schemas.GameOut)
def get_game(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(404)
    return game

@router.patch("/api/games/{game_id}")
def rename_game(game_id: int, payload: dict, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
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
    rows = q.order_by(models.GameMember.sort_order).all()
    return [
        {
            "id": m.id,
            "game_id": m.game_id,
            "name": m.name,
            "discord_id": m.discord_id,
            "sort_order": m.sort_order,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "deleted_at": m.deleted_at.isoformat() if m.deleted_at else None,
        }
        for m in rows
    ]

@router.post("/api/games/{game_id}/members")
def create_member(game_id: int, payload: schemas.MemberCreate, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    if not payload.discord_id or not payload.discord_id.strip():
        raise HTTPException(400, "discord_id is required")
    discord_id = validate_discord_id(payload.discord_id)
    m = models.GameMember(game_id=game_id, name=payload.name, discord_id=discord_id)
    db.add(m)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, "Name or Discord ID already in use") from e
    db.refresh(m)
    regenerate_pairings(db, game_id)
    return {"id": m.id, "name": m.name, "discord_id": m.discord_id, "game_id": m.game_id}

@router.patch("/api/games/{game_id}/members/{member_id}")
def patch_member(game_id: int, member_id: int, payload: schemas.MemberPatch, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    m = db.query(models.GameMember).filter(models.GameMember.id == member_id, models.GameMember.game_id == game_id).first()
    if not m:
        raise HTTPException(404)
    if payload.name is not None:
        m.name = payload.name
    if "discord_id" in payload.model_dump(exclude_unset=True):
        discord_id = payload.discord_id
        if discord_id is None or not str(discord_id).strip():
            raise HTTPException(400, "discord_id cannot be empty")
        discord_id = validate_discord_id(discord_id)
        m.discord_id = discord_id
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, "Name or Discord ID conflict") from e
    regenerate_pairings(db, game_id)
    return {"id": m.id, "name": m.name, "discord_id": m.discord_id, "game_id": m.game_id}

@router.delete("/api/games/{game_id}/members/{member_id}")
def delete_member(game_id: int, member_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    m = db.query(models.GameMember).filter(models.GameMember.id == member_id, models.GameMember.game_id == game_id).first()
    if not m:
        raise HTTPException(404)
    m.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    regenerate_pairings(db, game_id)
    return {"ok": True}

@router.post("/api/games/{game_id}/members/{member_id}/restore")
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
    return {"id": m.id, "name": m.name, "discord_id": m.discord_id, "game_id": m.game_id}

# Questions
@router.get("/api/games/{game_id}/questions")
def list_questions(game_id: int, status: str = "upcoming", db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    from sqlalchemy import func
    # count edits per question to avoid N+1
    edit_counts_sq = db.query(
        models.ConnQuestionEdit.question_id,
        func.count(models.ConnQuestionEdit.id).label("cnt")
    ).group_by(models.ConnQuestionEdit.question_id).subquery()
    rows = db.query(
        models.ConnQuestion,
        func.coalesce(edit_counts_sq.c.cnt, 0).label("edit_count")
    ).outerjoin(
        edit_counts_sq, edit_counts_sq.c.question_id == models.ConnQuestion.id
    ).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == status
    ).order_by(models.ConnQuestion.sort_order).all()
    return [
        {
            "id": q.id,
            "game_id": q.game_id,
            "text": q.text,
            "tag": q.tag,
            "tag_auto": q.tag_auto,
            "status": q.status,
            "sort_order": q.sort_order,
            "edit_count": edit_count,
            "created_at": q.created_at.isoformat() if q.created_at else None,
            "updated_at": q.updated_at.isoformat() if q.updated_at else None,
        }
        for q, edit_count in rows
    ]

@router.post("/api/games/{game_id}/questions")
def create_question(game_id: int, payload: schemas.QuestionCreate, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
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
    require_game_writable(game_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if not q:
        raise HTTPException(404)
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
        new_text = payload.text
        if new_tag_auto:  # reclassify if auto
            new_tag = classify_sentiment(new_text)
    # if tag_auto being set to True, re-classify immediately
    if payload.tag_auto is True and (payload.tag is None):
        new_tag_auto = True
        new_tag = classify_sentiment(new_text)
    if new_text != q.text or new_tag != q.tag:
        edit = models.ConnQuestionEdit(question_id=q.id, old_text=q.text, old_tag=q.tag, edited_by=user.discord_id, edited_at=datetime.now(timezone.utc).replace(tzinfo=None))
        db.add(edit)
    q.text = new_text
    q.tag = new_tag
    q.tag_auto = new_tag_auto
    q.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {
        "id": q.id,
        "text": q.text,
        "tag": q.tag,
        "tag_auto": q.tag_auto,
        "status": q.status,
        "sort_order": q.sort_order,
    }

@router.get("/api/games/{game_id}/questions/{qid}/history")
def question_history(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    rows = db.query(models.ConnQuestionEdit, models.DiscordUser).outerjoin(
        models.DiscordUser, models.ConnQuestionEdit.edited_by == models.DiscordUser.discord_id
    ).filter(models.ConnQuestionEdit.question_id == qid).order_by(models.ConnQuestionEdit.edited_at).all()
    return [
        {
            "id": r.id,
            "question_id": r.question_id,
            "old_text": r.old_text,
            "old_tag": r.old_tag,
            "edited_by": r.edited_by,
            "edited_by_name": (du.global_name or du.username) if du else r.edited_by,
            "edited_at": (r.edited_at.isoformat() + "Z") if r.edited_at else None,
        }
        for r, du in rows
    ]

@router.post("/api/games/{game_id}/questions/{qid}/graveyard")
def graveyard_question(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if q:
        q.status = "graveyard"
        db.commit()
    return {"ok": True}

@router.post("/api/games/{game_id}/questions/{qid}/restore")
def restore_question(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
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
    require_game_writable(game_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if q:
        if q.status != "graveyard":
            raise HTTPException(400, "Question must be archived before permanent deletion")
        db.delete(q)
        db.commit()
    return {"ok": True}

@router.post("/api/games/{game_id}/questions/reorder")
def reorder_questions(game_id: int, payload: schemas.ReorderRequest, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    qids = payload.question_ids
    # Validate: non-empty
    if not qids:
        raise HTTPException(400, "question_ids must not be empty")
    # Validate: no duplicates
    if len(qids) != len(set(qids)):
        raise HTTPException(400, "duplicate question_ids")
    # Validate: all IDs belong to this game and status=upcoming
    rows = db.query(models.ConnQuestion.id).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "upcoming",
        models.ConnQuestion.id.in_(qids)
    ).all()
    found_ids = {r[0] for r in rows}
    if len(found_ids) != len(qids):
        raise HTTPException(400, "one or more question_ids are invalid, do not belong to this game, or are not upcoming")
    # Validate: must include ALL upcoming questions (no missing IDs)
    total_upcoming = db.query(models.ConnQuestion.id).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "upcoming"
    ).count()
    if len(found_ids) != total_upcoming:
        raise HTTPException(400, "question_ids must include all upcoming questions")
    for i, qid in enumerate(qids):
        db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).update({"sort_order": i})
    db.commit()
    return {"ok": True}


@router.post("/api/games/{game_id}/questions/recycle")
def recycle_questions(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    # find max sort_order among existing upcoming questions
    max_sort = db.query(models.ConnQuestion.sort_order).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "upcoming"
    ).order_by(models.ConnQuestion.sort_order.desc()).first()
    sort_order = (max_sort[0] + 1) if max_sort else 0
    # recycle used questions, ordered by id ASC (no last_asked column in this schema)
    used_qs = db.query(models.ConnQuestion).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "used"
    ).order_by(models.ConnQuestion.id.asc()).all()
    for q in used_qs:
        q.status = "upcoming"
        q.sort_order = sort_order
        sort_order += 1
    db.commit()
    return {"recycled_count": len(used_qs)}


@router.post("/api/games/{game_id}/questions/seed")
def seed_questions(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    from ..question_bank import STARTER_QUESTIONS
    # append after existing upcoming questions
    max_sort = db.query(models.ConnQuestion.sort_order).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "upcoming"
    ).order_by(models.ConnQuestion.sort_order.desc()).first()
    sort_order = (max_sort[0] + 1) if max_sort else 0
    # skip duplicates (case-insensitive text match against existing questions in this game)
    existing_texts = {
        t.lower().strip()
        for (t,) in db.query(models.ConnQuestion.text).filter(models.ConnQuestion.game_id == game_id).all()
    }
    inserted = 0
    for text in STARTER_QUESTIONS:
        if text.lower().strip() in existing_texts:
            continue
        tag = classify_sentiment(text)
        q = models.ConnQuestion(
            game_id=game_id, text=text, tag=tag, tag_auto=True,
            status="upcoming", sort_order=sort_order
        )
        db.add(q)
        sort_order += 1
        inserted += 1
        existing_texts.add(text.lower().strip())
    db.commit()
    return {"inserted": inserted, "total_bank": len(STARTER_QUESTIONS)}


@router.post("/api/games/{game_id}/questions/import")
def import_questions(game_id: int, payload: schemas.QuestionImport, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    max_sort = db.query(models.ConnQuestion.sort_order).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "upcoming"
    ).order_by(models.ConnQuestion.sort_order.desc()).first()
    sort_order = (max_sort[0] + 1) if max_sort else 0
    existing_texts = {
        t.lower().strip()
        for (t,) in db.query(models.ConnQuestion.text).filter(models.ConnQuestion.game_id == game_id).all()
    }
    inserted = 0
    skipped = 0
    for raw in payload.questions:
        text = raw.strip()
        if not text or len(text) > 500:
            skipped += 1
            continue
        if text.lower() in existing_texts:
            skipped += 1
            continue
        tag = classify_sentiment(text)
        q = models.ConnQuestion(
            game_id=game_id, text=text, tag=tag, tag_auto=True,
            status="upcoming", sort_order=sort_order
        )
        db.add(q)
        sort_order += 1
        inserted += 1
        existing_texts.add(text.lower())
    db.commit()
    return {"inserted": inserted, "skipped": skipped}


@router.get("/api/games/{game_id}/questions/export")
def export_questions(game_id: int, status: str = "all", db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.game_id == game_id)
    if status != "all":
        q = q.filter(models.ConnQuestion.status == status)
    rows = q.order_by(models.ConnQuestion.sort_order).all()
    return [
        {"text": r.text, "tag": r.tag, "status": r.status, "sort_order": r.sort_order}
        for r in rows
    ]

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
    pairs = db.query(models.ConnPairing).filter(models.ConnPairing.game_id == game_id, models.ConnPairing.round_num == round_num).all()
    # Auto-generate pairings if missing - cycles through N-1 groups
    if not pairs:
        # Get active members
        members = db.query(models.GameMember).filter(
            models.GameMember.game_id == game_id,
            models.GameMember.deleted_at.is_(None)
        ).order_by(models.GameMember.id).all()
        member_ids = [m.id for m in members]
        if len(member_ids) >= 3:
            from ..pairing import generate_groups
            groups = generate_groups(member_ids)
            num_groups = len(groups)
            if num_groups > 0:
                group_idx = (round_num - 1) % num_groups
                pairings = groups[group_idx]
                for asker_id, target_id in pairings:
                    db.add(models.ConnPairing(
                        game_id=game_id,
                        round_num=round_num,
                        asker_member_id=asker_id,
                        target_member_id=target_id
                    ))
                db.commit()
                # Re-query
                pairs = db.query(models.ConnPairing).filter(
                    models.ConnPairing.game_id == game_id,
                    models.ConnPairing.round_num == round_num
                ).all()
    member_map = {m.id: m for m in db.query(models.GameMember).filter(models.GameMember.game_id == game_id).all()}
    out_pairs = []
    for p in pairs:
        asker = member_map.get(p.asker_member_id)
        target = member_map.get(p.target_member_id)
        if asker and target:
            out_pairs.append({"asker_id": asker.id, "asker_name": asker.name, "asker_discord_id": asker.discord_id, "target_id": target.id, "target_name": target.name, "target_discord_id": target.discord_id})
    # Always sync current_question to first upcoming by sort_order.
    # This makes Round tab reflect Questions tab order immediately after reordering,
    # and prevents stale current_question_id from causing NULL/duplicate plays
    # during API-driven bulk round completion.
    first_upcoming = db.query(models.ConnQuestion).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "upcoming"
    ).order_by(models.ConnQuestion.sort_order).first()
    first_id = first_upcoming.id if first_upcoming else None
    if state.current_question_id != first_id:
        state.current_question_id = first_id
        db.commit()
    question = first_upcoming
    q_out = None
    if question:
        q_out = {
            "id": question.id,
            "text": question.text,
            "tag": question.tag,
            "tag_auto": question.tag_auto,
            "status": question.status,
        }
    return {"round_num": round_num, "question": q_out, "pairings": out_pairs}

@router.post("/api/games/{game_id}/round/complete")
def complete_round(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_writable(game_id, db)
    require_membership(game_id, user.discord_id, db)
    state = db.query(models.ConnState).filter(models.ConnState.game_id == game_id).first()
    if not state:
        raise HTTPException(400, "no state")
    # Sync current_question to first upcoming before recording play.
    # Prevents NULL/stale question_id in ConnPlay if complete is called
    # without a prior GET /round, or after the question queue was reordered.
    first_upcoming = db.query(models.ConnQuestion).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "upcoming"
    ).order_by(models.ConnQuestion.sort_order).first()
    first_id = first_upcoming.id if first_upcoming else None
    if state.current_question_id != first_id:
        state.current_question_id = first_id
    if first_id is None:
        raise HTTPException(400, "no question available")
    round_num = state.current_round
    play = models.ConnPlay(game_id=game_id, round_num=round_num, question_id=state.current_question_id, played_by=user.discord_id)
    db.add(play)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(409, "round already completed") from e
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
    state.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"ok": True, "next_round": state.current_round}

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

# ---- Join / Invites / Admin / Archive / History / Pairings ----

def require_game_admin(game_id: int, discord_id: str, db: Session):
    # Game membership = admin access. Superuser bypass is in require_membership.
    mem = require_membership(game_id, discord_id, db)
    return mem


def require_game_writable(game_id: int, db: Session):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if game and game.archived_at is not None:
        raise HTTPException(403, "game is archived")
    return game


@router.post("/api/games/join")
def join_game(payload: schemas.JoinRequest, request: Request, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    # rate limiting enforced in middleware
    token_hash = hashlib.sha256(payload.invite_token.encode()).hexdigest()
    invite = db.query(models.GameInvite).filter(models.GameInvite.token_hash == token_hash).first()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if not invite or invite.expires_at < now:
        raise HTTPException(403, "invalid or expired invite")
    game_id = invite.game_id
    require_game_writable(game_id, db)
    # grant membership if not already
    existing = db.query(models.GameMembership).filter(models.GameMembership.game_id == game_id, models.GameMembership.discord_id == user.discord_id).first()
    if not existing:
        db.add(models.GameMembership(game_id=game_id, discord_id=user.discord_id))
    db.delete(invite)
    db.commit()
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    return {"game_id": game_id, "name": game.name if game else "", "archived_at": game.archived_at.isoformat() + "Z" if game and game.archived_at else None}

@router.post("/api/games/{game_id}/invites")
def create_invite(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    token = secrets.token_urlsafe(12)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
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
    return {"id": invite.id, "invite_token": token, "expires_at": invite.expires_at.isoformat()}

@router.get("/api/games/{game_id}/invites")
def list_invites(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
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
            "created_at": r.created_at,
            "expires_at": r.expires_at,
        })
    return out

@router.delete("/api/games/{game_id}/invites/{invite_id}")
def revoke_invite(game_id: int, invite_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    inv = db.query(models.GameInvite).filter(models.GameInvite.id == invite_id, models.GameInvite.game_id == game_id).first()
    if not inv:
        raise HTTPException(404)
    db.delete(inv)
    db.commit()
    return {"ok": True}

@router.post("/api/games/{game_id}/archive")
def archive_game(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(404)
    game.archived_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"ok": True}

@router.post("/api/games/{game_id}/unarchive")
def unarchive_game(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(404)
    game.archived_at = None
    db.commit()
    return {"ok": True}

@router.delete("/api/games/{game_id}")
def delete_game(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(404)
    if game.archived_at is None:
        raise HTTPException(400, "game must be archived before deletion")
    # ConnPairing.asker_member_id / target_member_id are RESTRICT; delete pairings first
    # to avoid FK violation when GameMember rows cascade-delete from Game
    db.query(models.ConnPairing).filter(models.ConnPairing.game_id == game_id).delete()
    db.delete(game)
    db.commit()
    return {"ok": True}

@router.get("/api/games/{game_id}/admins")
def list_admins(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    rows = db.query(models.GameMembership, models.DiscordUser).join(
        models.DiscordUser, models.GameMembership.discord_id == models.DiscordUser.discord_id
    ).filter(models.GameMembership.game_id == game_id).all()
    return [{"discord_id": m.GameMembership.discord_id, "joined_at": m.GameMembership.joined_at, "username": m.DiscordUser.username, "global_name": m.DiscordUser.global_name} for m in rows]

@router.delete("/api/games/{game_id}/admins/{discord_id}")
def revoke_admin(game_id: int, discord_id: str, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_game_admin(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    if discord_id == user.discord_id:
        raise HTTPException(400, "cannot revoke yourself")
    mem = db.query(models.GameMembership).filter(models.GameMembership.game_id == game_id, models.GameMembership.discord_id == discord_id).first()
    if mem:
        db.delete(mem)
    db.commit()
    return {"ok": True}

@router.get("/api/games/{game_id}/history")
def game_history(game_id: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    plays = db.query(models.ConnPlay, models.ConnQuestion, models.DiscordUser).outerjoin(
        models.ConnQuestion, models.ConnPlay.question_id == models.ConnQuestion.id
    ).outerjoin(
        models.DiscordUser, models.ConnPlay.played_by == models.DiscordUser.discord_id
    ).filter(models.ConnPlay.game_id == game_id).order_by(models.ConnPlay.round_num.desc()).all()
    # preload all members for pairing name resolution
    member_map = {m.id: m for m in db.query(models.GameMember).filter(models.GameMember.game_id == game_id).all()}
    out = []
    for play, q, du in plays:
        # get pairings for this round
        pairs = db.query(models.ConnPairing).filter(
            models.ConnPairing.game_id == game_id,
            models.ConnPairing.round_num == play.round_num
        ).all()
        pairings_out = []
        for p in pairs:
            asker = member_map.get(p.asker_member_id)
            target = member_map.get(p.target_member_id)
            if asker and target:
                pairings_out.append({
                    "asker_id": asker.id, "asker_name": asker.name, "asker_discord_id": asker.discord_id,
                    "target_id": target.id, "target_name": target.name, "target_discord_id": target.discord_id
                })
        played_by_username = None
        if du:
            played_by_username = du.global_name or du.username
        out.append({
            "round_num": play.round_num,
            "played_at": play.played_at.isoformat() if play.played_at else None,
            "played_by": play.played_by,
            "played_by_username": played_by_username,
            "question_id": play.question_id,
            "question_text": q.text if q else None,
            "question_tag": q.tag if q else None,
            "pairings": pairings_out,
        })
    return out

@router.get("/api/games/{game_id}/pairings")
def get_pairings(game_id: int, round: int | None = None, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
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

# ensure require_membership is called on every endpoint - audit above: yes
