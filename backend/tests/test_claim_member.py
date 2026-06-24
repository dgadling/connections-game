"""Regression test for ClaimGate broken URL bug.

Bug introduced in 39d40ba: frontend POSTed to
  /api/games/{game_id}/claim
but backend route is
  /api/games/{game_id}/members/claim
Result: 404, unhandled rejection, "Join game" button did nothing.

Also verifies claim endpoint behavior for future frontend use
(Members tab Edit can claim via PATCH, but direct claim endpoint still exists).
"""


def test_claim_member_by_id(client, test_user, game, db_session):
    # create unclaimed member
    from app import models
    m = models.GameMember(game_id=game.id, name="Unclaimed Bob", discord_id=None)
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    member_id = m.id

    # claim it
    r = client.post(f"/api/games/{game.id}/members/claim", json={"member_id": member_id})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["member_id"] == member_id
    assert data["discord_id"] == test_user.discord_id


def test_claim_member_by_name_creates_new(client, test_user, game):
    r = client.post(f"/api/games/{game.id}/members/claim", json={"name": "New Charlie"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "New Charlie"
    assert data["discord_id"] == test_user.discord_id


def test_claim_requires_member_id_xor_name(client, test_user, game):
    # neither
    r = client.post(f"/api/games/{game.id}/members/claim", json={})
    assert r.status_code == 400
    # both
    r = client.post(f"/api/games/{game.id}/members/claim", json={"member_id": 1, "name": "x"})
    assert r.status_code == 400


def test_claim_already_claimed_fails(client, test_user, game, db_session):
    from app import models
    # create a member already claimed by test_user
    m = models.GameMember(game_id=game.id, name="Alice", discord_id=test_user.discord_id)
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)

    # try claiming alice again - already claimed
    r = client.post(f"/api/games/{game.id}/members/claim", json={"member_id": m.id})
    assert r.status_code == 400


def test_claim_endpoint_path_is_members_claim(client, test_user, game):
    """Regression: frontend was POSTing to /api/games/{id}/claim (wrong).
    Correct path is /api/games/{id}/members/claim"""
    # wrong path should 404 or 405
    r = client.post(f"/api/games/{game.id}/claim", json={"name": "x"})
    assert r.status_code in (404, 405)
    # correct path should work
    r = client.post(f"/api/games/{game.id}/members/claim", json={"name": "Correct Path"})
    assert r.status_code == 200
