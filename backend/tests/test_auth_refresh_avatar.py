"""Test Discord avatar_hash refresh in /auth/refresh."""
from unittest.mock import AsyncMock, MagicMock, patch
from tests.conftest import make_authed_client
from app import models


def _mock_discord_user_api(mock_client, avatar_hash):
    """Mock httpx.AsyncClient.get for https://discord.com/api/v10/users/@me"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "id": "123456789012345678",
        "username": "testuser",
        "global_name": "Test User",
        "avatar": avatar_hash,
    }
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


def _mock_token_refresh(mock_client):
    """Mock httpx.AsyncClient.post for Discord token refresh"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "access_token": "new_access_123",
        "refresh_token": "new_refresh_456",
        "expires_in": 604800,
        "token_type": "Bearer",
    }
    mock_client.post = AsyncMock(return_value=mock_resp)
    return mock_client


def test_auth_refresh_updates_avatar_hash_when_changed(db_session, test_user, monkeypatch):
    """Avatar hash changed on Discord → DB updated, response includes new hash."""
    from app.crypto import encrypt_token
    from app.main import app

    # setup: user has old avatar, oauth token exists
    test_user.avatar_hash = "old_avatar_abc"
    db_session.commit()

    db_session.query(models.DiscordOAuthToken).delete()
    db_session.commit()
    token_row = models.DiscordOAuthToken(
        discord_id=test_user.discord_id,
        access_token_encrypted=encrypt_token("old_access"),
        refresh_token_encrypted=encrypt_token("old_refresh"),
        expires_at=models.utcnow() if hasattr(models, 'utcnow') else None,
    )
    # fix expires_at if needed
    from app.timeutil import utcnow
    from datetime import timedelta
    token_row.expires_at = utcnow() + timedelta(days=1)
    token_row.updated_at = utcnow()
    db_session.add(token_row)
    db_session.commit()

    # mock httpx: token refresh succeeds, then profile fetch returns NEW avatar
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        _mock_token_refresh(mock_client)
        _mock_discord_user_api(mock_client, avatar_hash="new_avatar_xyz")
        mock_client_class.return_value = mock_client

        client = make_authed_client(db_session, test_user)
        try:
            client.cookies.set("discord_id_hint", test_user.discord_id)
            r = client.post("/auth/refresh", json={"discord_id": test_user.discord_id})
        finally:
            app.dependency_overrides.clear()

    assert r.status_code == 200
    data = r.json()
    assert data["avatar_hash"] == "new_avatar_xyz"

    # verify DB updated
    db_session.refresh(test_user)
    assert test_user.avatar_hash == "new_avatar_xyz"


def test_auth_refresh_avatar_unchanged_no_error(db_session, test_user, monkeypatch):
    """Avatar hash same → no error, response includes hash."""
    from app.crypto import encrypt_token
    from app.timeutil import utcnow
    from datetime import timedelta
    from app.main import app

    test_user.avatar_hash = "same_avatar_123"
    db_session.commit()

    db_session.query(models.DiscordOAuthToken).delete()
    db_session.commit()
    token_row = models.DiscordOAuthToken(
        discord_id=test_user.discord_id,
        access_token_encrypted=encrypt_token("old_access"),
        refresh_token_encrypted=encrypt_token("old_refresh"),
        expires_at=utcnow() + timedelta(days=1),
        updated_at=utcnow(),
    )
    db_session.add(token_row)
    db_session.commit()

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        _mock_token_refresh(mock_client)
        _mock_discord_user_api(mock_client, avatar_hash="same_avatar_123")
        mock_client_class.return_value = mock_client

        client = make_authed_client(db_session, test_user)
        try:
            client.cookies.set("discord_id_hint", test_user.discord_id)
            r = client.post("/auth/refresh", json={"discord_id": test_user.discord_id})
        finally:
            app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["avatar_hash"] == "same_avatar_123"
    db_session.refresh(test_user)
    assert test_user.avatar_hash == "same_avatar_123"


def test_auth_refresh_avatar_cleared_when_null(db_session, test_user):
    """Discord returns avatar=null → DB cleared to None."""
    from app.crypto import encrypt_token
    from app.timeutil import utcnow
    from datetime import timedelta
    from app.main import app

    test_user.avatar_hash = "old_avatar_abc"
    db_session.commit()

    db_session.query(models.DiscordOAuthToken).delete()
    db_session.commit()
    token_row = models.DiscordOAuthToken(
        discord_id=test_user.discord_id,
        access_token_encrypted=encrypt_token("old_access"),
        refresh_token_encrypted=encrypt_token("old_refresh"),
        expires_at=utcnow() + timedelta(days=1),
        updated_at=utcnow(),
    )
    db_session.add(token_row)
    db_session.commit()

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        _mock_token_refresh(mock_client)
        _mock_discord_user_api(mock_client, avatar_hash=None)
        mock_client_class.return_value = mock_client

        client = make_authed_client(db_session, test_user)
        try:
            client.cookies.set("discord_id_hint", test_user.discord_id)
            r = client.post("/auth/refresh", json={"discord_id": test_user.discord_id})
        finally:
            app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["avatar_hash"] is None
    db_session.refresh(test_user)
    assert test_user.avatar_hash is None


def test_auth_refresh_avatar_api_failure_graceful(db_session, test_user):
    """Discord profile API fails → refresh still succeeds, stale avatar returned."""
    from app.crypto import encrypt_token
    from app.timeutil import utcnow
    from datetime import timedelta
    from app.main import app

    test_user.avatar_hash = "stale_avatar_999"
    db_session.commit()

    db_session.query(models.DiscordOAuthToken).delete()
    db_session.commit()
    token_row = models.DiscordOAuthToken(
        discord_id=test_user.discord_id,
        access_token_encrypted=encrypt_token("old_access"),
        refresh_token_encrypted=encrypt_token("old_refresh"),
        expires_at=utcnow() + timedelta(days=1),
        updated_at=utcnow(),
    )
    db_session.add(token_row)
    db_session.commit()

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        _mock_token_refresh(mock_client)
        # profile fetch fails
        async def mock_get_fail(*args, **kwargs):
            raise Exception("Discord API down")
        mock_client.get = mock_get_fail
        mock_client_class.return_value = mock_client

        client = make_authed_client(db_session, test_user)
        try:
            client.cookies.set("discord_id_hint", test_user.discord_id)
            r = client.post("/auth/refresh", json={"discord_id": test_user.discord_id})
        finally:
            app.dependency_overrides.clear()

    # refresh must succeed despite profile fetch failure
    assert r.status_code == 200
    data = r.json()
    # stale avatar returned
    assert data["avatar_hash"] == "stale_avatar_999"
    db_session.refresh(test_user)
    assert test_user.avatar_hash == "stale_avatar_999"
