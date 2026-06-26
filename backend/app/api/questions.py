from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from .. import models, schemas
from ..db import get_db
from ..auth import require_user, require_membership
from ..tagging import classify_sentiment
from ..timeutil import utcnow
from .common import require_game_writable

router = APIRouter(prefix="/api/games/{game_id}/questions", tags=["questions"])


@router.get("", response_model=list[schemas.QuestionListItem])
def list_questions(game_id: int, status: str = "upcoming", db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
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
    out = []
    for q, edit_count in rows:
        out.append(schemas.QuestionListItem(
            id=q.id,
            game_id=q.game_id,
            text=q.text,
            tag=q.tag,
            tag_auto=q.tag_auto,
            status=q.status,
            sort_order=q.sort_order,
            edit_count=edit_count,
            created_at=q.created_at,
            updated_at=q.updated_at,
        ))
    return out


@router.post("", response_model=schemas.QuestionCreateResponse)
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
    return schemas.QuestionCreateResponse(question_id=q.id, tag=q.tag, tag_auto=True)


@router.patch("/{qid}", response_model=schemas.QuestionPatchResponse)
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
        edit = models.ConnQuestionEdit(question_id=q.id, old_text=q.text, old_tag=q.tag, edited_by=user.discord_id, edited_at=utcnow())
        db.add(edit)
    q.text = new_text
    q.tag = new_tag
    q.tag_auto = new_tag_auto
    q.updated_at = utcnow()
    db.commit()
    return q


@router.get("/{qid}/history", response_model=list[schemas.QuestionHistoryItem])
def question_history(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    rows = db.query(models.ConnQuestionEdit, models.DiscordUser).outerjoin(
        models.DiscordUser, models.ConnQuestionEdit.edited_by == models.DiscordUser.discord_id
    ).filter(models.ConnQuestionEdit.question_id == qid).order_by(models.ConnQuestionEdit.edited_at).all()
    return [
        schemas.QuestionHistoryItem(
            id=r.id,
            question_id=r.question_id,
            old_text=r.old_text,
            old_tag=r.old_tag,
            edited_by=r.edited_by,
            edited_by_name=(du.global_name or du.username) if du else r.edited_by,
            edited_at=r.edited_at,
        )
        for r, du in rows
    ]


@router.post("/{qid}/graveyard", response_model=schemas.OkResponse)
def graveyard_question(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if q:
        q.status = "graveyard"
        db.commit()
    return schemas.OkResponse()


@router.post("/{qid}/restore", response_model=schemas.OkResponse)
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
    return schemas.OkResponse()


@router.delete("/{qid}", response_model=schemas.OkResponse)
def delete_question(game_id: int, qid: int, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.id == qid, models.ConnQuestion.game_id == game_id).first()
    if q:
        if q.status != "graveyard":
            raise HTTPException(400, "Question must be archived before permanent deletion")
        db.delete(q)
        db.commit()
    return schemas.OkResponse()


@router.post("/reorder", response_model=schemas.OkResponse)
def reorder_questions(game_id: int, payload: schemas.ReorderRequest, db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    require_game_writable(game_id, db)
    qids = payload.question_ids
    # Validate: no duplicates
    if len(qids) != len(set(qids)):
        raise HTTPException(400, "duplicate question_ids")
    # Lock all upcoming questions FOR UPDATE to prevent concurrent reorder races
    locked_qs = db.query(models.ConnQuestion).filter(
        models.ConnQuestion.game_id == game_id,
        models.ConnQuestion.status == "upcoming"
    ).with_for_update().all()
    locked_ids = {q.id for q in locked_qs}
    # Validate: all IDs belong to this game and status=upcoming
    found_ids = set(qids) & locked_ids
    if len(found_ids) != len(qids):
        raise HTTPException(400, "one or more question_ids are invalid, do not belong to this game, or are not upcoming")
    # Validate: must include ALL upcoming questions (no missing IDs)
    if len(found_ids) != len(locked_ids):
        raise HTTPException(400, "question_ids must include all upcoming questions")
    try:
        # Two-phase update to avoid unique constraint violations during reorder:
        # 1. Move all to temporary negative sort_order values (injective, no collisions)
        for q in locked_qs:
            q.sort_order = -q.sort_order - 10000
        db.flush()
        # 2. Set final sort_order values
        q_map = {q.id: q for q in locked_qs}
        for i, qid in enumerate(qids):
            q_map[qid].sort_order = i
        db.commit()
    except Exception as e:
        db.rollback()
        # Unique constraint violation or other race - return 409
        from sqlalchemy.exc import IntegrityError
        if isinstance(e, IntegrityError):
            raise HTTPException(409, "concurrent reorder conflict") from e
        raise
    return schemas.OkResponse()


@router.post("/recycle", response_model=schemas.RecycleResponse)
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
    return schemas.RecycleResponse(recycled_count=len(used_qs))


@router.post("/seed", response_model=schemas.SeedResponse)
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
    return schemas.SeedResponse(inserted=inserted, total_bank=len(STARTER_QUESTIONS))


@router.post("/import", response_model=schemas.ImportQuestionsResponse)
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
    # Note: payload.questions are already validated by Pydantic (strip, 1-500 chars)
    # We still count duplicates as skipped to preserve existing behavior
    for text in payload.questions:
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
    return schemas.ImportQuestionsResponse(inserted=inserted, skipped=skipped)


@router.get("/export", response_model=list[schemas.ExportQuestionItem])
def export_questions(game_id: int, status: str = "all", db: Session = Depends(get_db), user: models.DiscordUser = Depends(require_user)):
    require_membership(game_id, user.discord_id, db)
    q = db.query(models.ConnQuestion).filter(models.ConnQuestion.game_id == game_id)
    if status != "all":
        q = q.filter(models.ConnQuestion.status == status)
    rows = q.order_by(models.ConnQuestion.sort_order).all()
    return rows
