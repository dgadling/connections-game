def test_member_create_returns_dict(client, game):
    r = client.post(f"/api/games/{game.id}/members", json={"name": "Charlie"})
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
