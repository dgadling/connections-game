"""Test that reordering questions updates current_question in get_round"""
from app import models
from app.api.games import get_round, complete_round
import app.api.games as games_module


def test_reorder_updates_current_question(db_session, game, test_user):
    """Reordering upcoming questions should update current_question in get_round (no stale cache)"""
    # Add 3 members so pairings work
    for i in range(3):
        m = models.GameMember(game_id=game.id, name=f"Member{i}", discord_id=f"member{i}_test")
        db_session.add(m)
    # Add 2 questions
    q1 = models.ConnQuestion(game_id=game.id, text="Question 1", tag="warm", status="upcoming", sort_order=0)
    q2 = models.ConnQuestion(game_id=game.id, text="Question 2", tag="warm", status="upcoming", sort_order=1)
    db_session.add_all([q1, q2])
    db_session.commit()
    db_session.refresh(q1)
    db_session.refresh(q2)

    orig_req = games_module.require_membership
    games_module.require_membership = lambda *a, **k: test_user
    try:
        # First get_round - should return Q1
        result = get_round(game.id, db_session, test_user)
        assert result["question"]["text"] == "Question 1", f"expected Q1, got {result['question']}"

        # Verify state
        state = db_session.query(models.ConnState).filter(models.ConnState.game_id == game.id).first()
        assert state.current_question_id == q1.id

        # Reorder: swap Q1 and Q2 sort_order
        # Use temp negative values to avoid unique constraint violation (uq_question_game_status_sort)
        q1.sort_order = -10
        q2.sort_order = -11
        db_session.flush()
        q1.sort_order = 1
        q2.sort_order = 0
        db_session.commit()

        # get_round again - SHOULD return Q2 now (first in sort_order)
        # BUG: currently returns cached Q1
        result = get_round(game.id, db_session, test_user)
        assert result["question"]["text"] == "Question 2", f"After reorder, expected Q2, got {result['question']['text'] if result['question'] else None} - BUG: current_question_id is cached stale"

        # Verify state updated
        state = db_session.query(models.ConnState).filter(models.ConnState.game_id == game.id).first()
        assert state.current_question_id == q2.id, f"state.current_question_id should be Q2 ({q2.id}), got {state.current_question_id}"

        # Complete round - should record Q2
        complete_round(game.id, db_session, test_user)
        play = db_session.query(models.ConnPlay).filter(models.ConnPlay.game_id == game.id, models.ConnPlay.round_num == 1).first()
        assert play is not None
        assert play.question_id == q2.id, f"ConnPlay.question_id should be Q2 ({q2.id}), got {play.question_id} - BUG: complete_round used stale current_question_id"
    finally:
        games_module.require_membership = orig_req
