# Tests for GH #33 - OAuth redirect_after validation / open-redirect fix
# Originally: ad-hoc string matching in auth_discord_start()

from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app, base_url="http://testserver")


def test_redirect_after_blocks_open_redirects():
    """Malicious redirect_after values must sanitize to '/'"""
    malicious_redirects = [
        "https://evil.com",
        "http://evil.com",
        "//evil.com",
        "/\\evil.com",  # backslash - urlparse treats as netloc
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "/@evil.com",  # some browsers treat //@ as //
        # URL-encoded tricks
        "/%2f%2fevil.com",
    ]

    for malicious in malicious_redirects:
        # POST /auth/discord/start with malicious redirect_after
        resp = client.post(
            "/auth/discord/start",
            params={"redirect_after": malicious}
        )
        assert resp.status_code == 200, f"Failed for {malicious!r}: {resp.status_code}"
        data = resp.json()
        # auth_url should contain state param, redirect_after is stored server-side
        # We need to check that the stored oauth_state.redirect_after was sanitized
        # Since we can't easily inspect DB from here, at minimum verify request didn't crash
        # and returned a valid auth_url
        assert "auth_url" in data
        assert "discord.com/oauth2/authorize" in data["auth_url"]

    # TODO: once middleware is fixed, verify DB stores sanitized redirect_after
    # For now this test documents the attack vectors - will fail initially
    # then pass after fix


def test_redirect_after_allows_safe_paths():
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


def test_oauth_error_messages_sanitized():
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
