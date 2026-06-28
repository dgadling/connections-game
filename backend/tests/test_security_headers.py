def test_security_headers_present(client):
    """Security headers middleware should add required headers to all responses."""
    resp = client.get("/healthz")
    assert resp.status_code == 200
    # Required headers
    assert "strict-transport-security" in resp.headers
    assert resp.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert resp.headers.get("x-frame-options") == "DENY"
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert "content-security-policy" in resp.headers
    csp = resp.headers["content-security-policy"]
    # Check CSP contains required directives
    assert "default-src 'self'" in csp
    assert "script-src 'self' 'unsafe-inline'" in csp
    assert "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com" in csp
    assert "font-src 'self' https://fonts.gstatic.com" in csp
    assert "img-src 'self' data: https:" in csp
    assert "connect-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp

def test_security_headers_api_response(client, game):
    """Headers should apply to API responses too."""
    resp = client.get(f"/api/games/{game.id}")
    assert resp.status_code == 200
    assert resp.headers.get("x-frame-options") == "DENY"
    assert "content-security-policy" in resp.headers
