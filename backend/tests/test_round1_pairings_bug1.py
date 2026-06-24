"""Bug 1: Round 1 pairings missing after adding members"""
from app import models
from app.api.games import get_round
import app.api.games as games_module


def test_round1_pairings_after_adding_members(db_session, game, test_user):
    """When members are added to a fresh game, round 1 should have pairings"""
    # game fixture starts with 0 members, add 5
    for i in range(5):
        m = models.GameMember(game_id=game.id, name=f"Member{i}")
        db_session.add(m)
    db_session.commit()

    # Mock require_membership
    orig_req = games_module.require_membership
    games_module.require_membership = lambda *a, **k: test_user
    try:
        result = get_round(game.id, db_session, test_user)
        assert result["round_num"] == 1
        assert len(result["pairings"]) == 5, f"Round 1 should have 5 pairings, got {len(result['pairings'])}"
        # Verify derangement (no self-pairings)
        for p in result["pairings"]:
            assert p["asker_id"] != p["target_id"]
    finally:
        games_module.require_membership = orig_req
