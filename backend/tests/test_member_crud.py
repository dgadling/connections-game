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

    # Issue #16: leading/trailing ./_ and consecutive dots must be rejected
    for bad_id in [".abc", "_abc", "abc.", "abc_", "a..b", ".a.", "_a_"]:
        r = client.post(f"/api/games/{game.id}/members", json={"name": "Bad", "discord_id": bad_id})
        assert r.status_code == 400, f"{bad_id} should be rejected"


def test_member_discord_id_optional(client, game):
    """GameMember.discord_id is optional (issue #17)"""
    # Create without discord_id
    r = client.post(f"/api/games/{game.id}/members", json={"name": "NoDiscord"})
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "NoDiscord"
    assert data["discord_id"] is None

    # Create with empty string → normalized to None
    r = client.post(f"/api/games/{game.id}/members", json={"name": "EmptyDiscord", "discord_id": ""})
    assert r.status_code == 200
    assert r.json()["discord_id"] is None

    # Patch to clear discord_id
    member_id = data["id"]
    r = client.patch(f"/api/games/{game.id}/members/{member_id}", json={"discord_id": None})
    assert r.status_code == 200
    assert r.json()["discord_id"] is None

    # Patch to set discord_id
    r = client.patch(f"/api/games/{game.id}/members/{member_id}", json={"discord_id": "test_user"})
    assert r.status_code == 200
    assert r.json()["discord_id"] == "test_user"


def test_game_discord_role_id(client, game):
    """Game.discord_role_id can be set/cleared (issue #17)"""
    # Set role_id
    role = "1407476013709135975"
    r = client.patch(f"/api/games/{game.id}", json={"discord_role_id": role})
    assert r.status_code == 200

    r = client.get(f"/api/games/{game.id}")
    assert r.status_code == 200
    assert r.json()["discord_role_id"] == role

    # Clear role_id
    r = client.patch(f"/api/games/{game.id}", json={"discord_role_id": None})
    assert r.status_code == 200
    r = client.get(f"/api/games/{game.id}")
    assert r.json()["discord_role_id"] is None

    # Invalid role_id rejected
    r = client.patch(f"/api/games/{game.id}", json={"discord_role_id": "not_a_snowflake"})
    assert r.status_code == 400

