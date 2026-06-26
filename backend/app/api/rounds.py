from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models
from ..db import get_db
from ..auth import require_user, require_membership
from ..timeutil import utcnow, serialize_datetime
from .common import require_game_writable

router = APIRouter(prefix="/api/games/{game_id}", tags=["rounds"])


@router.get("/round")
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


@router.post("/round/complete")
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
        db.flush()
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
    state.updated_at = utcnow()
    db.commit()
    return {"ok": True, "next_round": state.current_round}


@router.get("/history")
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
            "played_at": serialize_datetime(play.played_at),
            "played_by": play.played_by,
            "played_by_username": played_by_username,
            "question_id": play.question_id,
            "question_text": q.text if q else None,
            "question_tag": q.tag if q else None,
            "pairings": pairings_out,
        })
    return out


@router.get("/pairings")
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
