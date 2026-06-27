# Tests for Round 1 pairings after adding members (formerly Bug 1)
# Originally: test_round1_pairings_bug1.py
"""Round 1 pairings missing after adding members"""
from app import models
from app.api.games import get_round
import app.api.games as games_module


def test_round1_pairings_after_adding_members(db_session, game, test_user):
    """When members are added to a fresh game, round 1 should have pairings"""
    # game fixture starts with 0 members, add 5
    for i in range(5):
        m = models.GameMember(game_id=game.id, name=f"Member{i}", discord_id=f"member{i}_test")
        db_session.add(m)
    db_session.commit()

    # Mock require_membership
    orig_req = games_module.require_membership
    games_module.require_membership = lambda *a, **k: test_user
    try:
        result = get_round(game.id, db_session, test_user)
        # get_round now returns Pydantic model (issue #25)
        round_num = result.round_num if hasattr(result, 'round_num') else result["round_num"]
        pairings = result.pairings if hasattr(result, 'pairings') else result["pairings"]
        assert round_num == 1
        assert len(pairings) == 5, f"Round 1 should have 5 pairings, got {len(pairings)}"
        # Verify derangement (no self-pairings)
        for p in pairings:
            asker_id = p.asker_id if hasattr(p, 'asker_id') else p["asker_id"]
            target_id = p.target_id if hasattr(p, 'target_id') else p["target_id"]
            assert asker_id != target_id
    finally:
        games_module.require_membership = orig_req
