"""Test ConnPairing CASCADE delete behavior.

Ensures deleting a game cascades to pairings without manual cleanup.
See issue #27 Part C.
"""
from app import models


def test_game_delete_cascades_pairings(client, game, db_session):
    """Deleting a game should cascade-delete its pairings via FK CASCADE."""
    # create members
    m1 = models.GameMember(game_id=game.id, name="Alice")
    m2 = models.GameMember(game_id=game.id, name="Bob")
    db_session.add_all([m1, m2])
    db_session.commit()
    db_session.refresh(m1)
    db_session.refresh(m2)

    # create pairing
    pairing = models.ConnPairing(
        game_id=game.id, round_num=1,
        asker_member_id=m1.id, target_member_id=m2.id
    )
    db_session.add(pairing)
    db_session.commit()

    # archive then delete game via API (delete_game requires archived)
    r = client.post(f"/api/games/{game.id}/archive")
    assert r.status_code == 200

    r = client.delete(f"/api/games/{game.id}")
    assert r.status_code == 200, r.text

    # pairing should be gone (CASCADE)
    remaining = db_session.query(models.ConnPairing).filter(
        models.ConnPairing.game_id == game.id
    ).count()
    assert remaining == 0
