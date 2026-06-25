def test_member_create_returns_dict(client, game):
    r = client.post(f"/api/games/{game.id}/members", json={"name": "Charlie", "discord_id": "charlie_test"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert "id" in data
    assert data["name"] == "Charlie"
    # should NOT be returning SQLAlchemy internals
    assert "_sa_instance_state" not in str(data)

def test_member_patch_returns_dict(client, game, members):
    m = members[0]
    r = client.patch(f"/api/games/{game.id}/members/{m.id}", json={"name": "Alice Renamed"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert data["name"] == "Alice Renamed"
    assert data["id"] == m.id

def test_member_restore_returns_dict(client, game, members, db_session):
    from datetime import datetime
    m = members[0]
    m.deleted_at = datetime.utcnow()
    db_session.commit()
    r = client.post(f"/api/games/{game.id}/members/{m.id}/restore")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert data["id"] == m.id
    assert data["name"] == m.name
def test_member_discord_username_accepted(client, game):
    """Discord @username should be accepted and stored without leading @"""
    # Test with @ prefix
    r = client.post(f"/api/games/{game.id}/members", json={"name": "Jon", "discord_id": "@jon_cst"})
    assert r.status_code == 200
    data = r.json()
    assert data["discord_id"] == "jon_cst"  # stripped @

    # Test without @ prefix
    r = client.post(f"/api/games/{game.id}/members", json={"name": "Jane", "discord_id": "jane.doe_123"})
    assert r.status_code == 200
    data = r.json()
    assert data["discord_id"] == "jane.doe_123"

    # Test snowflake still works (back-compat)
    r = client.post(f"/api/games/{game.id}/members", json={"name": "Bob", "discord_id": "134515788454428673"})
    assert r.status_code == 200
    data = r.json()
    assert data["discord_id"] == "134515788454428673"

    # Test invalid username rejected
    r = client.post(f"/api/games/{game.id}/members", json={"name": "Bad", "discord_id": "a"})  # too short
    assert r.status_code == 400

    r = client.post(f"/api/games/{game.id}/members", json={"name": "Bad2", "discord_id": "bad@name"})  # invalid char
    assert r.status_code == 400

    r = client.post(f"/api/games/{game.id}/members", json={"name": "Bad3", "discord_id": "x" * 33})  # too long
    assert r.status_code == 400
