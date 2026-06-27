# Tests for GH #33 - OAuth redirect_after validation / open-redirect fix
# Originally: ad-hoc string matching in auth_discord_start()

from app import models
from urllib.parse import urlparse, parse_qs


def test_redirect_after_blocks_open_redirects(client, db_session):
    """Malicious redirect_after values must sanitize to '/'"""
    malicious_redirects = [
        "https://evil.com",
        "http://evil.com",
        "//evil.com",
        "/\\evil.com",  # backslash can normalize to / in some browsers
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
    ]

    for malicious in malicious_redirects:
        # POST /auth/discord/start with malicious redirect_after
        resp = client.post(
            "/auth/discord/start",
            params={"redirect_after": malicious}
        )
        assert resp.status_code == 200, f"Failed for {malicious!r}: {resp.status_code}"
        data = resp.json()
        assert "auth_url" in data
        assert "discord.com/oauth2/authorize" in data["auth_url"]

        # Extract state token from auth_url and verify DB stored sanitized redirect_after
        auth_url = data["auth_url"]
        parsed = urlparse(auth_url)
        qs = parse_qs(parsed.query)
        state_token = qs.get("state", [None])[0]
        assert state_token, f"no state in auth_url for {malicious!r}"

        oauth_state = db_session.query(models.OAuthState).filter(
            models.OAuthState.state_token == state_token
        ).first()
        assert oauth_state is not None, f"OAuthState not found for {malicious!r}"
        assert oauth_state.redirect_after == "/", (
            f"redirect_after NOT sanitized for {malicious!r}: "
            f"got {oauth_state.redirect_after!r}, expected '/'"
        )


def test_redirect_after_allows_safe_paths(client, db_session):
    """Legitimate same-origin paths must be preserved"""
    safe_redirects = [
        "/",
        "/questions",
        "/questions?foo=bar",
        "/game/abc123",
        "/admin",
    ]

    for safe in safe_redirects:
        resp = client.post(
            "/auth/discord/start",
            params={"redirect_after": safe}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "auth_url" in data

        # Verify DB stored the original safe path unchanged
        auth_url = data["auth_url"]
        parsed = urlparse(auth_url)
        qs = parse_qs(parsed.query)
        state_token = qs.get("state", [None])[0]
        assert state_token

        oauth_state = db_session.query(models.OAuthState).filter(
            models.OAuthState.state_token == state_token
        ).first()
        assert oauth_state is not None
        assert oauth_state.redirect_after == safe, (
            f"safe redirect_after was modified: "
            f"input {safe!r}, stored {oauth_state.redirect_after!r}"
        )


def test_oauth_error_messages_sanitized(client):
    """OAuth provider errors must NOT be echoed to client - generic message only"""
    # Try OAuth callback with error param but no/mismatched state
    resp = client.get(
        "/auth/discord/callback",
        params={"error": "access_denied", "error_description": "User rejected <script>alert(1)</script>"},
        follow_redirects=False,
    )
    # Should get 400, but error message must NOT contain raw provider error
    assert resp.status_code == 400
    body = resp.text.lower()
    # Client response must NOT leak raw error strings
    assert "access_denied" not in body, "OAuth error leaked to client"
    assert "script" not in body, "XSS payload leaked to client"
    assert "alert" not in body, "XSS payload leaked to client"
    # Should get generic message
    assert "authentication failed" in body or "auth" in body
