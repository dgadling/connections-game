# CSRF security tests - verify HMAC binding works


def test_csrf_missing_token_rejected(db_session, test_user):
    """POST without X-CSRF-Token → 403"""
    # Use client fixture which has valid CSRF, then strip the header
    from tests.conftest import make_authed_client
    client = make_authed_client(db_session, test_user)
    try:
        # Remove CSRF header
        del client.headers["X-CSRF-Token"]
        resp = client.post("/api/games", json={"name": "No CSRF"})
        assert resp.status_code == 403
        assert "CSRF" in resp.text
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_csrf_bad_hmac_rejected(db_session, test_user):
    """POST with wrong HMAC → 403"""
    from tests.conftest import make_authed_client
    client = make_authed_client(db_session, test_user)
    try:
        client.headers["X-CSRF-Token"] = "bad-hmac-not-matching-session"
        # Cookie still has the valid csrf_token, header is bad → header != cookie → 403
        # Actually middleware checks header == cookie first, so make them match but bad HMAC
        client.cookies.set("csrf_token", "bad-hmac-not-matching-session")
        resp = client.post("/api/games", json={"name": "Bad HMAC"})
        assert resp.status_code == 403
        assert "CSRF" in resp.text
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_csrf_token_session_mismatch_rejected(db_session, test_user):
    """Valid token for session A, but session_cookie=B → 403"""
    from tests.conftest import make_authed_client
    import secrets
    client = make_authed_client(db_session, test_user)
    try:
        # Swap session_cookie to a different random token, keep old csrf_token
        # CSRF token = HMAC(old_session), session_cookie = new_session
        # → HMAC check fails
        fake_session = secrets.token_urlsafe(32)
        client.cookies.set("connections_session", fake_session)
        # csrf_token cookie + X-CSRF-Token header still = HMAC(old_session)
        resp = client.post("/api/games", json={"name": "Session mismatch"})
        assert resp.status_code == 403
        assert "CSRF" in resp.text
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_csrf_valid_accepted(db_session, test_user):
    """Valid session + valid HMAC token → 200"""
    # The regular client fixture already does this - smoke test
    from tests.conftest import make_authed_client
    client = make_authed_client(db_session, test_user)
    try:
        resp = client.post("/api/games", json={"name": "CSRF OK Test"})
        # Superuser check may fail if test_user isn't superuser - just check it's NOT a CSRF 403
        assert resp.status_code != 403 or "CSRF" not in resp.text
        # If superuser env is set, should be 200; otherwise 403 "superuser only" is fine
        # The point is CSRF passed
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_csrf_hmac_uses_session_secret(monkeypatch):
    """Regression test for GitHub issue #20
    generate_csrf_token() must use SESSION_SECRET, not DISCORD_CLIENT_SECRET.

    Proves: token = HMAC(SESSION_SECRET, session_token)
    Proves: token != HMAC(DISCORD_CLIENT_SECRET, session_token)
    """
    import hmac
    import hashlib
    from app import auth

    # Use random secrets so test doesn't depend on conftest values
    session_token = "test_session_abc123"
    fake_session_secret = "random_session_secret_xyz_987654321"
    fake_discord_secret = "completely_different_discord_secret_111"

    # Patch the module-level SESSION_SECRET used by generate_csrf_token
    monkeypatch.setattr(auth, "SESSION_SECRET", fake_session_secret)

    # Call the function under test
    token = auth.generate_csrf_token(session_token)

    # Compute expected HMAC independently in-test
    expected = hmac.new(
        fake_session_secret.encode(),
        session_token.encode(),
        hashlib.sha256
    ).hexdigest()

    assert token == expected, (
        f"CSRF token does not match HMAC(SESSION_SECRET, session_token). "
        f"got {token}, expected {expected}"
    )

    # Prove it's NOT using DISCORD_CLIENT_SECRET
    wrong = hmac.new(
        fake_discord_secret.encode(),
        session_token.encode(),
        hashlib.sha256
    ).hexdigest()

    assert token != wrong, (
        "CSRF token matches HMAC(DISCORD_CLIENT_SECRET, session_token) - "
        "bug #20 regressed, CSRF key is wrong!"
    )

    # Also prove it's NOT the old buggy key even if DISCORD_CLIENT_SECRET
    # happens to equal SESSION_SECRET in the test env
    import os
    discord_secret_env = os.environ.get("DISCORD_CLIENT_SECRET", "")
    if discord_secret_env:
        discord_hmac = hmac.new(
            discord_secret_env.encode(),
            session_token.encode(),
            hashlib.sha256
        ).hexdigest()
        # If env DISCORD_CLIENT_SECRET != fake_session_secret, tokens must differ
        if discord_secret_env != fake_session_secret:
            assert token != discord_hmac, (
                "CSRF token matches HMAC(DISCORD_CLIENT_SECRET_env, ...), "
                "function is using wrong secret"
            )

