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
