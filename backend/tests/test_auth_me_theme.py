from app import models


def test_auth_me_includes_theme(client, test_user):
    """GET /auth/me includes theme field."""
    r = client.get("/auth/me")
    assert r.status_code == 200
    data = r.json()
    assert "theme" in data
    assert data["theme"] == "default"
    # also check other expected fields still present
    assert data["discord_id"] == test_user.discord_id
    assert "avatar_hash" in data


def test_auth_refresh_includes_theme(db_session, test_user, monkeypatch):
    """POST /auth/refresh includes theme field."""
    from tests.conftest import make_authed_client
    # set a non-default theme
    test_user.theme = "tavern"
    db_session.commit()

    # mock refresh_discord_token to avoid needing real OAuth tokens
    async def mock_refresh(db, discord_id):
        return "fake_access_token"

    monkeypatch.setattr("app.auth.refresh_discord_token", mock_refresh)

    client = make_authed_client(db_session, test_user)
    # auth_refresh requires discord_id_hint cookie
    client.cookies.set("discord_id_hint", test_user.discord_id)
    try:
        r = client.post("/auth/refresh", json={"discord_id": test_user.discord_id})
        assert r.status_code == 200
        data = r.json()
        assert data["theme"] == "tavern"
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_patch_auth_me_valid_theme(client, test_user, db_session):
    """PATCH /auth/me with valid theme → 200 + persisted."""
    r = client.patch("/auth/me", json={"theme": "discord"})
    assert r.status_code == 200
    data = r.json()
    assert data["theme"] == "discord"
    assert data["discord_id"] == test_user.discord_id

    # verify persisted
    db_session.refresh(test_user)
    assert test_user.theme == "discord"


def test_patch_auth_me_all_valid_themes(client, test_user, db_session):
    """PATCH /auth/me accepts all ALLOWED_THEMES."""
    for theme in sorted(models.ALLOWED_THEMES):
        r = client.patch("/auth/me", json={"theme": theme})
        assert r.status_code == 200, f"theme {theme} failed"
        assert r.json()["theme"] == theme
        db_session.refresh(test_user)
        assert test_user.theme == theme


def test_patch_auth_me_invalid_theme(client):
    """PATCH /auth/me with invalid theme → 422."""
    r = client.patch("/auth/me", json={"theme": "not_a_theme"})
    assert r.status_code == 422
    # Pydantic validation error
    assert "theme" in r.text.lower()


def test_patch_auth_me_empty_theme(client):
    """PATCH /auth/me with empty theme → 422."""
    r = client.patch("/auth/me", json={"theme": ""})
    assert r.status_code == 422


def test_patch_auth_me_unauthenticated(db_session):
    """PATCH /auth/me without auth → 401/403."""
    from fastapi.testclient import TestClient
    from app.main import app

    # clear any overrides from other tests
    app.dependency_overrides.clear()
    client = TestClient(app)
    r = client.patch("/auth/me", json={"theme": "discord"})
    # CSRF middleware rejects unauthenticated PATCH with 403 before auth check (401)
    assert r.status_code in (401, 403)


def test_patch_auth_me_missing_csrf(db_session, test_user):
    """PATCH /auth/me without CSRF token → 403."""
    from tests.conftest import make_authed_client
    from app.main import app

    client = make_authed_client(db_session, test_user)
    try:
        # remove CSRF header
        del client.headers["X-CSRF-Token"]
        r = client.patch("/auth/me", json={"theme": "discord"})
        # CSRF middleware rejects with 403
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_patch_auth_me_theme_round_trips(client, test_user):
    """Theme persists and round-trips through GET /auth/me."""
    # set theme
    r = client.patch("/auth/me", json={"theme": "tarot"})
    assert r.status_code == 200

    # GET should return the updated theme
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["theme"] == "tarot"
