"""Regression test for game_id vs id API inconsistency.

Bug: POST /api/games returned GameOut with `id`, GET /api/games returned
`game_id`. Frontend GameList used g.id, got undefined, all /api/games/undefined/...
requests failed with 422, UI showed empty game.

Fix: standardize all game endpoints on GameOut with `id` field.
"""
def test_create_game_returns_gameout_with_id_and_role(client, test_user):
    r = client.post("/api/games", json={"name": "Test Game"})
    assert r.status_code == 200
    data = r.json()
    # Must have `id`, NOT `game_id`
    assert "id" in data, f"response missing 'id': {data}"
    assert "game_id" not in data, f"response should use 'id', not 'game_id': {data}"
    assert data["name"] == "Test Game"
    assert "slug" in data
    assert "owner_discord_id" in data


def test_list_games_returns_gameout_with_id_and_role(client, test_user, game):
    r = client.get("/api/games")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    g = data[0]
    assert "id" in g, f"list item missing 'id': {g}"
    assert "game_id" not in g, f"list should use 'id', not 'game_id': {g}"


def test_get_game_returns_gameout_with_id_and_role(client, test_user, game):
    r = client.get(f"/api/games/{game.id}")
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert "game_id" not in data
    assert data["id"] == game.id
