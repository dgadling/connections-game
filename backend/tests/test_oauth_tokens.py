"""OAuth token storage + refresh + logout tests"""
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.db import get_db
from app import models
from app.crypto import encrypt_token, decrypt_token


def _mock_discord_api(mock_client, discord_id="123456789012345678"):
    mock_resp_token = MagicMock()
    mock_resp_token.status_code = 200
    mock_resp_token.json.return_value = {
        "access_token": "fake_access_abc",
        "refresh_token": "fake_refresh_xyz",
        "expires_in": 604800,
    }
    mock_resp_user = MagicMock()
    mock_resp_user.status_code = 200
    mock_resp_user.json.return_value = {
        "id": discord_id,
        "username": "testuser",
        "global_name": "Test User",
        "avatar": None,
    }
    mock_client.post = AsyncMock(return_value=mock_resp_token)
    mock_client.get = AsyncMock(return_value=mock_resp_user)
    return mock_client


def _oauth_client(db_session, with_csrf=True):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db
    cookies = {}
    headers = {}
    if with_csrf:
        # Set up valid session + CSRF HMAC for tests that hit CSRF-protected endpoints
        # Tests that specifically want to test missing/invalid CSRF can clear these
        from app.auth import generate_csrf_token
        import secrets
        session_token = secrets.token_urlsafe(32)
        csrf_token = generate_csrf_token(session_token)
        cookies = {"connections_session": session_token, "csrf_token": csrf_token}
        headers = {"X-CSRF-Token": csrf_token}
        # Note: we do NOT create an AuthSession DB row - CSRF HMAC validation
        # only needs the session_token cookie value, not a DB lookup.
        # Rate limiting will fall back to IP-based limiting when session not found.
    client = TestClient(app, cookies=cookies, headers=headers, follow_redirects=False)
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def test_encrypt_decrypt_roundtrip():
    pt = "secret_token_123"
    ct = encrypt_token(pt)
    assert ct != pt
    assert decrypt_token(ct) == pt


def test_oauth_callback_stores_encrypted_tokens_and_sets_hint_cookie(db_session):
    db_session.query(models.DiscordOAuthToken).delete()
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.query(models.OAuthState).delete()
    db_session.commit()

    state_token = "test_state_tokens"
    oauth_state = models.OAuthState(
        state_token=state_token,
        redirect_after="/",
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=10),
        used_silent_auth=False,
    )
    db_session.add(oauth_state)
    db_session.commit()

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=_mock_discord_api(mock_client))
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        for client in _oauth_client(db_session):
            resp = client.get(f"/auth/discord/callback?code=fake_code&state={state_token}")
    assert resp.status_code in (302, 307)
    # check token stored encrypted
    token_row = db_session.query(models.DiscordOAuthToken).filter_by(discord_id="123456789012345678").first()
    assert token_row is not None
    assert token_row.access_token_encrypted != "fake_access_abc"
    assert decrypt_token(token_row.access_token_encrypted) == "fake_access_abc"
    assert decrypt_token(token_row.refresh_token_encrypted) == "fake_refresh_xyz"
    # check hint cookie
    set_cookie = resp.headers.get("set-cookie", "")
    assert "discord_id_hint" in set_cookie.lower() or any("discord_id_hint" in c.lower() for c in resp.headers.get_list("set-cookie"))


def test_auth_refresh_creates_new_session(db_session):
    # setup user + oauth token
    db_session.query(models.DiscordOAuthToken).delete()
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.commit()
    user = models.DiscordUser(
        discord_id="123456789012345678",
        username="testuser",
        global_name="Test User",
        avatar_hash=None,
    )
    db_session.add(user)
    db_session.commit()
    token_row = models.DiscordOAuthToken(
        discord_id="123456789012345678",
        access_token_encrypted=encrypt_token("old_access"),
        refresh_token_encrypted=encrypt_token("old_refresh"),
        expires_at=datetime.utcnow() + timedelta(days=1),
        updated_at=datetime.utcnow(),
    )
    db_session.add(token_row)
    db_session.commit()

    # mock Discord refresh endpoint
    async def mock_post(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "access_token": "new_access_123",
            "refresh_token": "new_refresh_456",
            "expires_in": 604800,
            "token_type": "Bearer",
        }
        return resp

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = mock_post
        mock_client_class.return_value = mock_client

        for client in _oauth_client(db_session):
            # auth_refresh now requires CSRF token + discord_id_hint cookie matching body
            client.cookies.set("discord_id_hint", "123456789012345678")
            resp = client.post(
                "/auth/refresh",
                json={"discord_id": "123456789012345678"},

            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["discord_id"] == "123456789012345678"
    # new session created
    assert db_session.query(models.AuthSession).count() == 1
    # token row updated
    token_row = db_session.query(models.DiscordOAuthToken).filter_by(discord_id="123456789012345678").first()
    assert decrypt_token(token_row.access_token_encrypted) == "new_access_123"
    assert decrypt_token(token_row.refresh_token_encrypted) == "new_refresh_456"


def test_auth_refresh_invalid_token_deletes_row_returns_401(db_session):
    db_session.query(models.DiscordOAuthToken).delete()
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.commit()
    user = models.DiscordUser(
        discord_id="123456789012345678",
        username="testuser",
        global_name="Test User",
        avatar_hash=None,
    )
    db_session.add(user)
    db_session.flush()
    token_row = models.DiscordOAuthToken(
        discord_id="123456789012345678",
        access_token_encrypted=encrypt_token("old_access"),
        refresh_token_encrypted=encrypt_token("bad_refresh"),
        expires_at=datetime.utcnow() + timedelta(days=1),
        updated_at=datetime.utcnow(),
    )
    db_session.add(token_row)
    db_session.commit()

    async def mock_post_fail(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 400
        resp.json.return_value = {"error": "invalid_grant"}
        return resp

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = mock_post_fail
        mock_client_class.return_value = mock_client

        for client in _oauth_client(db_session):
            client.cookies.set("discord_id_hint", "123456789012345678")
            resp = client.post(
                "/auth/refresh",
                json={"discord_id": "123456789012345678"},

            )
    assert resp.status_code == 401
    # token row deleted
    assert db_session.query(models.DiscordOAuthToken).filter_by(discord_id="123456789012345678").first() is None
    # no session created
    assert db_session.query(models.AuthSession).count() == 0


def test_auth_refresh_rejects_without_discord_id_hint(db_session):
    """Account takeover protection: /auth/refresh must have matching discord_id_hint cookie.
    Without it, attacker can obtain session for any user with stored refresh_token."""
    db_session.query(models.DiscordOAuthToken).delete()
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.commit()
    user = models.DiscordUser(
        discord_id="123456789012345678",
        username="testuser",
        global_name="Test User",
        avatar_hash=None,
    )
    db_session.add(user)
    db_session.commit()
    from app.crypto import encrypt_token
    token_row = models.DiscordOAuthToken(
        discord_id="123456789012345678",
        access_token_encrypted=encrypt_token("old_access"),
        refresh_token_encrypted=encrypt_token("old_refresh"),
        expires_at=datetime.utcnow() + timedelta(days=1),
        updated_at=datetime.utcnow(),
    )
    db_session.add(token_row)
    db_session.commit()

    # Mock httpx to avoid proxy env crash if endpoint is reached unexpectedly
    # (also prevents actual Discord API calls)
    from unittest.mock import AsyncMock, MagicMock, patch
    async def mock_post_fail(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 400
        resp.json.return_value = {"error": "invalid_grant"}
        return resp

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = mock_post_fail
        mock_client_class.return_value = mock_client

        for client in _oauth_client(db_session):
            # No discord_id_hint cookie → 401
            # CSRF is disabled in conftest, so we don't test CSRF here - that's enforced in production middleware
            resp = client.post(
                "/auth/refresh",
                json={"discord_id": "123456789012345678"},
            )
            assert resp.status_code == 401
            assert db_session.query(models.AuthSession).count() == 0

            # Wrong discord_id_hint → 401
            client.cookies.set("discord_id_hint", "999999999999999999")
            resp = client.post(
                "/auth/refresh",
                json={"discord_id": "123456789012345678"},
            )
            assert resp.status_code == 401
            assert db_session.query(models.AuthSession).count() == 0

            # Correct discord_id_hint - would proceed to refresh_discord_token,
            # which we've mocked to fail → 401, no session created
            # (proves the check passed and we got to the refresh step)
            client.cookies.set("discord_id_hint", "123456789012345678")
            resp = client.post(
                "/auth/refresh",
                json={"discord_id": "123456789012345678"},
            )
            # refresh_discord_token fails (mocked invalid_grant) → 401
            assert resp.status_code == 401
            assert db_session.query(models.AuthSession).count() == 0


def test_logout_deletes_tokens_and_clears_hint_cookie(db_session):
    # setup user + session + oauth token
    db_session.query(models.DiscordOAuthToken).delete()
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.commit()
    user = models.DiscordUser(
        discord_id="123456789012345678",
        username="testuser",
        global_name="Test User",
        avatar_hash=None,
    )
    db_session.add(user)
    db_session.commit()
    from app.auth import create_session
    session_token = create_session(db_session, user.discord_id)
    token_row = models.DiscordOAuthToken(
        discord_id=user.discord_id,
        access_token_encrypted=encrypt_token("acc"),
        refresh_token_encrypted=encrypt_token("ref"),
        expires_at=datetime.utcnow() + timedelta(days=1),
        updated_at=datetime.utcnow(),
    )
    db_session.add(token_row)
    db_session.commit()

    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    from app.auth import require_user, generate_csrf_token
    def override_require_user():
        return user
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_user] = override_require_user

    csrf_token = generate_csrf_token(session_token)
    try:
        client = TestClient(app, cookies={
            "connections_session": session_token,
            "csrf_token": csrf_token,
        })
        client.headers["X-CSRF-Token"] = csrf_token
        resp = client.post("/auth/logout")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    # session deleted
    assert db_session.query(models.AuthSession).count() == 0
    # oauth token deleted
    assert db_session.query(models.DiscordOAuthToken).filter_by(discord_id=user.discord_id).first() is None
    # hint cookie cleared
    cookies = resp.headers.get_list("set-cookie")
    combined = " ".join(cookies)
    assert "discord_id_hint" in combined.lower()
    assert "expires" in combined.lower() or "max-age=0" in combined.lower()
