# Tests for pairing wraparound after N-1 rounds (formerly Bug 2)
# Originally: test_pairings_wrap_bug2.py
"""Pairings exhaust after N-1 rounds - verify wraparound works"""
from app import models
from app.api.games import get_round, complete_round
import app.api.games as games_module


def test_pairings_wrap_after_n_minus_1_rounds(db_session, game, test_user):
    """With 4 members (3 pairing groups), round 4+ should wrap and still have pairings"""
    # Add 4 members
    for i in range(4):
        m = models.GameMember(game_id=game.id, name=f"Member{i}", discord_id=f"member{i}_test")
        db_session.add(m)
    # Seed questions - complete_round now rejects NULL question_id
    for i in range(10):
        q = models.ConnQuestion(game_id=game.id, text=f"Q{i}", tag="warm", tag_auto=True, status="upcoming", sort_order=i)
        db_session.add(q)
    db_session.commit()

    orig_req = games_module.require_membership
    games_module.require_membership = lambda *a, **k: test_user
    try:
        # Complete rounds 1-3
        def _get_pairings(res):
            # get_round now returns Pydantic model (issue #25); support both dict and model
            if hasattr(res, 'pairings'):
                return res.pairings
            return res["pairings"]
        def _get_round_num(res):
            if hasattr(res, 'round_num'):
                return res.round_num
            return res["round_num"]
        for rnd in range(1, 4):
            result = get_round(game.id, db_session, test_user)
            pairings = _get_pairings(result)
            assert len(pairings) == 4, f"Round {rnd} should have 4 pairings"
            complete_round(game.id, db_session, test_user)

        # Round 4 - should wrap (4 players = 3 groups, round 4 = group 0)
        result = get_round(game.id, db_session, test_user)
        assert _get_round_num(result) == 4
        pairings = _get_pairings(result)
        assert len(pairings) == 4, f"Round 4 should wrap and have 4 pairings, got {len(pairings)}"

        # Round 5 - should also wrap
        complete_round(game.id, db_session, test_user)
        result = get_round(game.id, db_session, test_user)
        assert _get_round_num(result) == 5
        pairings = _get_pairings(result)
        assert len(pairings) == 4, "Round 5 should wrap and have 4 pairings"
    finally:
        games_module.require_membership = orig_req
