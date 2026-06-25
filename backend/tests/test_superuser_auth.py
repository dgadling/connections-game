"""Superuser / game visibility authorization tests

Test matrix (3 users, 2 games):
- super_user: global owner, Discord ID from env SUPERUSER_DISCORD_ID
- admin_a: member/admin of game_a only
- admin_b: member/admin of game_a AND game_b
"""
import os
# Set SUPERUSER_DISCORD_ID before importing app modules (it's read at import time)
os.environ["SUPERUSER_DISCORD_ID"] = "999999999999999999"

import pytest

from app.main import app
from app import models
from tests.conftest import make_authed_client


# Superuser Discord ID for tests
SUPERUSER_DISCORD_ID = "999999999999999999"


@pytest.fixture
def super_user(db_session):
    u = models.DiscordUser(
        discord_id=SUPERUSER_DISCORD_ID,
        username="superuser",
        global_name="Super User",
        avatar_hash=None,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def admin_a(db_session):
    u = models.DiscordUser(
        discord_id="111111111111111111",
        username="admin_a",
        global_name="Admin A",
        avatar_hash=None,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def admin_b(db_session):
    u = models.DiscordUser(
        discord_id="222222222222222222",
        username="admin_b",
        global_name="Admin B",
        avatar_hash=None,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def game_a(db_session):
    """game_a: admin_a and admin_b are members, super_user is NOT in memberships table"""
    g = models.Game(
        name="Game A",
        owner_discord_id="111111111111111111",
    )
    db_session.add(g)
    db_session.commit()
    db_session.refresh(g)
    # memberships: admin_a and admin_b, NO super_user membership
    # GameMembership has NO role field - membership = admin access
    for discord_id in ["111111111111111111", "222222222222222222"]:
        mem = models.GameMembership(game_id=g.id, discord_id=discord_id)
        db_session.add(mem)
    state = models.ConnState(game_id=g.id, current_round=1)
    db_session.add(state)
    db_session.commit()
    return g


@pytest.fixture
def game_b(db_session):
    """game_b: only admin_b is a member, super_user is NOT in memberships table"""
    g = models.Game(
        name="Game B",
        owner_discord_id="222222222222222222",
    )
    db_session.add(g)
    db_session.commit()
    db_session.refresh(g)
    mem = models.GameMembership(game_id=g.id, discord_id="222222222222222222")
    db_session.add(mem)
    state = models.ConnState(game_id=g.id, current_round=1)
    db_session.add(state)
    db_session.commit()
    return g


def make_client(db_session, user):
    """Create a TestClient authenticated as `user`."""
    # Clear any previous overrides (tests call make_client multiple times)
    app.dependency_overrides.clear()
    return make_authed_client(db_session, user)


def test_list_games_visibility(db_session, super_user, admin_a, admin_b, game_a, game_b):
    """GET /api/games visibility matrix"""
    # super_user → sees game_a + game_b
    client = make_client(db_session, super_user)
    try:
        resp = client.get("/api/games")
        assert resp.status_code == 200, resp.text
        game_ids = {g["id"] for g in resp.json()}
        assert game_a.id in game_ids, f"super_user should see game_a, got {game_ids}"
        assert game_b.id in game_ids, f"super_user should see game_b, got {game_ids}"
    finally:
        app.dependency_overrides.clear()

    # admin_a → sees game_a only
    client = make_client(db_session, admin_a)
    try:
        resp = client.get("/api/games")
        assert resp.status_code == 200
        game_ids = {g["id"] for g in resp.json()}
        assert game_a.id in game_ids
        assert game_b.id not in game_ids, f"admin_a should NOT see game_b, got {game_ids}"
    finally:
        app.dependency_overrides.clear()

    # admin_b → sees game_a + game_b
    client = make_client(db_session, admin_b)
    try:
        resp = client.get("/api/games")
        assert resp.status_code == 200
        game_ids = {g["id"] for g in resp.json()}
        assert game_a.id in game_ids
        assert game_b.id in game_ids
    finally:
        app.dependency_overrides.clear()


def test_get_game_access_control(db_session, super_user, admin_a, admin_b, game_a, game_b):
    """GET /api/games/{id} access control"""
    # super_user can access both
    for game in [game_a, game_b]:
        client = make_client(db_session, super_user)
        try:
            resp = client.get(f"/api/games/{game.id}")
            assert resp.status_code == 200, f"super_user should access game {game.id}, got {resp.status_code}: {resp.text}"
        finally:
            app.dependency_overrides.clear()

    # admin_a can access game_a, 403 on game_b
    client = make_client(db_session, admin_a)
    try:
        resp = client.get(f"/api/games/{game_a.id}")
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()

    client = make_client(db_session, admin_a)
    try:
        resp = client.get(f"/api/games/{game_b.id}")
        assert resp.status_code == 403, f"admin_a should get 403 on game_b, got {resp.status_code}"
    finally:
        app.dependency_overrides.clear()

    # admin_b can access both
    for game in [game_a, game_b]:
        client = make_client(db_session, admin_b)
        try:
            resp = client.get(f"/api/games/{game.id}")
            assert resp.status_code == 200, f"admin_b should access game {game.id}"
        finally:
            app.dependency_overrides.clear()


def test_game_admin_endpoints(db_session, super_user, admin_a, admin_b, game_a, game_b):
    """Game admin endpoints: super_user + game members can manage their games"""
    # POST /api/games/{id}/invites - game admins can create invites
    # admin_a is member of game_a → should succeed
    # admin_b is member of game_a → should succeed
    # super_user → should succeed (bypass)
    for user in [super_user, admin_a, admin_b]:
        client = make_client(db_session, user)
        try:
            resp = client.post(f"/api/games/{game_a.id}/invites")
            assert resp.status_code == 200, f"{user.username} should succeed creating invite on game_a, got {resp.status_code}: {resp.text}"
        finally:
            app.dependency_overrides.clear()

    # game_b: admin_b is member → should succeed; super_user → succeed; admin_a NOT member → 403
    for user, should_succeed in [(super_user, True), (admin_b, True), (admin_a, False)]:
        client = make_client(db_session, user)
        try:
            resp = client.post(f"/api/games/{game_b.id}/invites")
            if should_succeed:
                assert resp.status_code == 200, f"{user.username} should succeed on game_b"
            else:
                assert resp.status_code == 403, f"{user.username} should get 403 on game_b, got {resp.status_code}"
        finally:
            app.dependency_overrides.clear()


def test_create_game_access(db_session, super_user, admin_a, admin_b):
    """POST /api/games: super_user → 201, admins → 403"""
    for user, should_succeed in [(super_user, True), (admin_a, False), (admin_b, False)]:
        client = make_client(db_session, user)
        try:
            resp = client.post("/api/games", json={"name": f"Test Game by {user.username}"})
            if should_succeed:
                assert resp.status_code == 200, f"{user.username} should create game, got {resp.status_code}: {resp.text}"
            else:
                assert resp.status_code == 403, f"{user.username} should get 403 creating game, got {resp.status_code}"
        finally:
            app.dependency_overrides.clear()
