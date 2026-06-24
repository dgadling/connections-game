"""Bug 2: Pairings exhaust after N-1 rounds"""
from app import models
from app.api.games import get_round, complete_round
import app.api.games as games_module


def test_pairings_wrap_after_n_minus_1_rounds(db_session, game, test_user):
    """With 4 members (3 pairing groups), round 4+ should wrap and still have pairings"""
    # Add 4 members
    for i in range(4):
        m = models.GameMember(game_id=game.id, name=f"Member{i}")
        db_session.add(m)
    db_session.commit()

    orig_req = games_module.require_membership
    games_module.require_membership = lambda *a, **k: test_user
    try:
        # Complete rounds 1-3
        for rnd in range(1, 4):
            result = get_round(game.id, db_session, test_user)
            assert len(result["pairings"]) == 4, f"Round {rnd} should have 4 pairings"
            complete_round(game.id, db_session, test_user)

        # Round 4 - should wrap (4 players = 3 groups, round 4 = group 0)
        result = get_round(game.id, db_session, test_user)
        assert result["round_num"] == 4
        assert len(result["pairings"]) == 4, f"Round 4 should wrap and have 4 pairings, got {len(result['pairings'])}"

        # Round 5 - should also wrap
        complete_round(game.id, db_session, test_user)
        result = get_round(game.id, db_session, test_user)
        assert result["round_num"] == 5
        assert len(result["pairings"]) == 4, "Round 5 should wrap and have 4 pairings"
    finally:
        games_module.require_membership = orig_req
