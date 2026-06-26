from __future__ import annotations
import secrets
import time
from collections import defaultdict, deque
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# Simple in-memory token bucket
class RateLimiter:
    def __init__(self):
        self.buckets: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window: int = 60) -> bool:
        now = time.time()
        q = self.buckets[key]
        while q and q[0] < now - window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True

limiter = RateLimiter()

def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # X-Forwarded-For: client, proxy1, proxy2, ...
        # Leftmost is easily spoofed. On GCP/Cloud Run the
        # right-most IP is the load balancer, and the one
        # immediately to its left is the client IP appended
        # by Google Front End (trusted).
        # Parse right-to-left to avoid spoofing.
        ips = [ip.strip() for ip in xff.split(",") if ip.strip()]
        if len(ips) >= 2:
            # second from right: GCP-detected client IP
            return ips[-2]
        if ips:
            return ips[0]
    return request.client.host if request.client else "unknown"

class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method
        ip = get_client_ip(request)

        # Rate limiting
        try:
            if path == "/api/games/join" and method == "POST":
                if not limiter.check(f"join:{ip}", 5, 60):
                    return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
            elif path.startswith("/auth/discord/start") and method == "POST":
                if not limiter.check(f"authstart:{ip}", 10, 60):
                    return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
            elif method in ("POST", "PATCH", "PUT", "DELETE") and path.startswith("/api/"):
                # per-user rate limit - try to extract discord_id from session (cheap check)
                # fall back to IP if no session yet
                from .auth import hash_token
                from .db import SessionLocal
                from . import models
                token = request.cookies.get("connections_session")
                user_key = ip
                if token:
                    try:
                        db = SessionLocal()
                        token_hash = hash_token(token)
                        sess = db.query(models.AuthSession).filter(models.AuthSession.session_token_hash == token_hash).first()
                        if sess:
                            user_key = f"user:{sess.discord_id}"
                        db.close()
                    except Exception:
                        pass
                if not limiter.check(f"mut:{user_key}", 60, 60):
                    return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
        except Exception:
            pass

        if method in ("POST", "PATCH", "PUT", "DELETE"):
            # CSRF check - skip initial auth endpoints that legitimately have no session/csrf yet
            skip_csrf = path.startswith("/auth/discord/start") or path.startswith("/auth/discord/callback")
            if not skip_csrf:
                csrf_header = request.headers.get("x-csrf-token")
                csrf_cookie = request.cookies.get("csrf_token")
                session_cookie = request.cookies.get("connections_session")
                # Validate CSRF token is bound to session via HMAC
                # Prevents subdomain cookie injection (classic double-submit weakness)
                if not csrf_header or not csrf_cookie or csrf_header != csrf_cookie:
                    return JSONResponse({"detail": "CSRF token required"}, status_code=403)
                if not session_cookie:
                    return JSONResponse({"detail": "CSRF token required"}, status_code=403)
                # Verify CSRF token matches HMAC(session_token)
                try:
                    from .auth import generate_csrf_token
                    expected = generate_csrf_token(session_cookie)
                    if not secrets.compare_digest(csrf_header, expected):
                        return JSONResponse({"detail": "CSRF token invalid"}, status_code=403)
                except Exception:
                    return JSONResponse({"detail": "CSRF token invalid"}, status_code=403)
        response = await call_next(request)
        return response
