"""OAuth state validation tests - TDD for mobile Safari cookie bug"""
from app.timeutil import utcnow
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.db import get_db
from app import models


def _mock_discord_api(mock_client):
    """Helper to mock Discord token exchange + userinfo"""
    mock_resp_token = MagicMock()
    mock_resp_token.status_code = 200
    mock_resp_token.json.return_value = {
        "access_token": "fake_token",
        "refresh_token": "fake_refresh_token",
        "expires_in": 604800,
        "token_type": "Bearer",
        "scope": "identify",
    }

    mock_resp_user = MagicMock()
    mock_resp_user.status_code = 200
    mock_resp_user.json.return_value = {
        "id": "123456789012345678",
        "username": "testuser",
        "global_name": "Test User",
        "avatar": None,
    }

    mock_client.post = AsyncMock(return_value=mock_resp_token)
    mock_client.get = AsyncMock(return_value=mock_resp_user)
    return mock_client


def _create_oauth_state(db, state_token="test_state_abc123", expired=False):
    """Create OAuthState in DB"""
    oauth_state = models.OAuthState(
        state_token=state_token,
        redirect_after="/",
        created_at=utcnow(),
        expires_at=utcnow() + timedelta(minutes=-1 if expired else 10),
    )
    db.add(oauth_state)
    db.commit()
    return oauth_state


def _oauth_client(db_session):
    """TestClient for OAuth flow - no require_user override"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    # Clear all overrides, then set only get_db
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db

    client = TestClient(app, follow_redirects=False)
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def test_oauth_callback_succeeds_without_cookie_when_db_state_valid(db_session):
    """Mobile Safari bug: cookie missing but DB state is valid → should SUCCEED (DB is authoritative)"""
    # Clean up
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.query(models.OAuthState).delete()
    db_session.commit()

    state_token = "test_state_no_cookie"
    _create_oauth_state(db_session, state_token)

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=_mock_discord_api(mock_client))
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        for client in _oauth_client(db_session):
            # Call callback WITHOUT oauth_state cookie (mobile Safari scenario)
            resp = client.get(f"/auth/discord/callback?code=fake_code&state={state_token}")

    # Should succeed (302 redirect with session cookies)
    assert resp.status_code in (302, 307), f"Expected redirect, got {resp.status_code}: {resp.text}"
    assert resp.status_code != 400, "OAuth callback should NOT require oauth_state cookie when DB state is valid"


def test_oauth_callback_rejects_when_state_not_in_db(db_session):
    """CSRF protection: state_token not in DB → reject, even if cookie matches"""
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.query(models.OAuthState).delete()
    db_session.commit()

    state_token = "nonexistent_state_xyz"

    for client in _oauth_client(db_session):
        # Callback with cookie matching state, but DB has no record
        resp = client.get(
            f"/auth/discord/callback?code=fake_code&state={state_token}",
            cookies={"oauth_state": state_token},
        )

    assert resp.status_code == 400
    assert "OAuth state" in resp.text


def test_oauth_callback_rejects_when_db_state_expired(db_session):
    """Expired OAuthState → reject"""
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.query(models.OAuthState).delete()
    db_session.commit()

    state_token = "expired_state_abc"
    _create_oauth_state(db_session, state_token, expired=True)

    for client in _oauth_client(db_session):
        resp = client.get(
            f"/auth/discord/callback?code=fake_code&state={state_token}",
            cookies={"oauth_state": state_token},
        )

    assert resp.status_code == 400
    assert "expired" in resp.text.lower()


def test_oauth_callback_single_use(db_session):
    """State token can only be used once - replay fails"""
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.query(models.OAuthState).delete()
    db_session.commit()

    state_token = "single_use_state_123"
    _create_oauth_state(db_session, state_token)

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=_mock_discord_api(mock_client))
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        for client in _oauth_client(db_session):
            # First use - should succeed
            resp1 = client.get(
                f"/auth/discord/callback?code=fake_code&state={state_token}",
                cookies={"oauth_state": state_token},
            )
            assert resp1.status_code in (302, 307), f"First use failed: {resp1.status_code} {resp1.text}"

            # Second use - same state_token, should fail (already consumed)
            resp2 = client.get(
                f"/auth/discord/callback?code=fake_code2&state={state_token}",
                cookies={"oauth_state": state_token},
            )

            assert resp2.status_code == 400
            assert "OAuth state" in resp2.text


def test_oauth_callback_cookie_mismatch_does_not_block_valid_db_state(db_session):
    """Cookie mismatch is logged but does NOT block if DB state is valid"""
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.query(models.OAuthState).delete()
    db_session.commit()

    state_token = "cookie_mismatch_state"
    _create_oauth_state(db_session, state_token)

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=_mock_discord_api(mock_client))
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        for client in _oauth_client(db_session):
            # Cookie has WRONG value, DB has correct state
            resp = client.get(
                f"/auth/discord/callback?code=fake_code&state={state_token}",
                cookies={"oauth_state": "wrong_cookie_value_xyz"},
            )

    # Should SUCCEED - DB is authoritative, cookie mismatch is just a warning
    assert resp.status_code in (302, 307), f"Expected success with DB-valid state despite cookie mismatch, got {resp.status_code}: {resp.text}"


def test_oauth_callback_valid_cookie_and_valid_db_still_works(db_session):
    """Existing happy path: valid cookie + valid DB state → success (regression guard)"""
    db_session.query(models.AuthSession).delete()
    db_session.query(models.DiscordUser).delete()
    db_session.query(models.OAuthState).delete()
    db_session.commit()

    state_token = "happy_path_state"
    _create_oauth_state(db_session, state_token)

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=_mock_discord_api(mock_client))
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        for client in _oauth_client(db_session):
            resp = client.get(
                f"/auth/discord/callback?code=fake_code&state={state_token}",
                cookies={"oauth_state": state_token},
            )

    assert resp.status_code in (302, 307), f"Happy path failed: {resp.status_code} {resp.text}"

    # Verify session was created
    session_count = db_session.query(models.AuthSession).count()
    assert session_count >= 1, "OAuth callback should create AuthSession"


# --- prompt=none silent auth tests (TDD) ---

def test_discord_oauth_url_includes_prompt_none_by_default():
    from app.auth import discord_oauth_url
    url = discord_oauth_url("xyz")
    assert "prompt=none" in url, url

def test_discord_oauth_url_omits_prompt_when_force_consent():
    from app.auth import discord_oauth_url
    url = discord_oauth_url("xyz", prompt_none=False)
    assert "prompt=none" not in url

def _create_oauth_state_with_silent(db_session, state_token, used_silent_auth=True):
    oauth_state = models.OAuthState(
        state_token=state_token,
        redirect_after="/",
        created_at=utcnow(),
        expires_at=utcnow() + timedelta(minutes=10),
        used_silent_auth=used_silent_auth,
    )
    db_session.add(oauth_state)
    db_session.commit()
    return oauth_state

def test_callback_consent_required_triggers_fallback(db_session):
    db_session.query(models.OAuthState).delete()
    db_session.commit()
    state_token = "consent_req"
    _create_oauth_state_with_silent(db_session, state_token, True)
    for client in _oauth_client(db_session):
        resp = client.get(f"/auth/discord/callback?error=consent_required&state={state_token}", follow_redirects=False)
    assert resp.status_code in (302, 307)
    loc = resp.headers.get("location", "")
    assert "/auth/discord/start" in loc
    assert "force_consent=1" in loc
    # state consumed
    assert db_session.query(models.OAuthState).filter_by(state_token=state_token).first() is None

def test_callback_login_required_triggers_fallback(db_session):
    db_session.query(models.OAuthState).delete()
    db_session.commit()
    state_token = "login_req"
    _create_oauth_state_with_silent(db_session, state_token, True)
    for client in _oauth_client(db_session):
        resp = client.get(f"/auth/discord/callback?error=login_required&state={state_token}", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "force_consent=1" in resp.headers.get("location", "")

def test_callback_access_denied_no_fallback(db_session):
    db_session.query(models.OAuthState).delete()
    db_session.commit()
    state_token = "access_den"
    _create_oauth_state_with_silent(db_session, state_token, True)
    for client in _oauth_client(db_session):
        resp = client.get(f"/auth/discord/callback?error=access_denied&state={state_token}")
    assert resp.status_code == 200
    assert "cancelled" in resp.text.lower()

def test_callback_invalid_client_no_fallback(db_session):
    db_session.query(models.OAuthState).delete()
    db_session.commit()
    # test all non-retry errors: access_denied, invalid_request, invalid_scope, unauthorized_client, unsupported_response_type
    for err in ["invalid_request", "invalid_scope", "unauthorized_client", "unsupported_response_type"]:
        state_token = f"bad_{err}"
        _create_oauth_state_with_silent(db_session, state_token, True)
        for client in _oauth_client(db_session):
            resp = client.get(f"/auth/discord/callback?error={err}&state={state_token}")
        assert resp.status_code == 400, f"{err} should 400, got {resp.status_code}"
        # OAuth errors are sanitized - client gets generic message, not raw error (GH #33)
        assert "authentication failed" in resp.text.lower()
        # Verify error is NOT leaked to client
        assert err not in resp.text.lower(), f"OAuth error {err!r} leaked to client"
        db_session.query(models.OAuthState).delete()
        db_session.commit()

def test_callback_loop_protection(db_session):
    """If used_silent_auth is False, do NOT fallback again"""
    db_session.query(models.OAuthState).delete()
    db_session.commit()
    state_token = "loop_test"
    _create_oauth_state_with_silent(db_session, state_token, False)
    for client in _oauth_client(db_session):
        resp = client.get(f"/auth/discord/callback?error=consent_required&state={state_token}")
    # should 400, NOT redirect loop
    assert resp.status_code == 400
    # OAuth errors are sanitized - generic message (GH #33)
    assert "authentication failed" in resp.text.lower()

def test_callback_interaction_required_triggers_fallback(db_session):
    db_session.query(models.OAuthState).delete()
    db_session.commit()
    state_token = "interaction_req"
    _create_oauth_state_with_silent(db_session, state_token, True)
    for client in _oauth_client(db_session):
        resp = client.get(f"/auth/discord/callback?error=interaction_required&state={state_token}", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "force_consent=1" in resp.headers.get("location", "")

def test_auth_start_force_consent_omits_prompt_none(db_session):
    """POST /auth/discord/start?force_consent=true should omit prompt=none"""
    # clean
    db_session.query(models.OAuthState).delete()
    db_session.commit()
    for client in _oauth_client(db_session):
        resp = client.post("/auth/discord/start?force_consent=true&redirect_after=/test")
        assert resp.status_code == 200
        data = resp.json()
        assert "auth_url" in data
        assert "prompt=none" not in data["auth_url"]
        # verify DB state was stored with used_silent_auth=False
        from urllib.parse import urlparse, parse_qs
        url = data["auth_url"]
        qs = parse_qs(urlparse(url).query)
        state = qs["state"][0]
        oauth_state = db_session.query(models.OAuthState).filter_by(state_token=state).first()
        assert oauth_state is not None
        assert oauth_state.used_silent_auth is False
        assert oauth_state.redirect_after == "/test"
