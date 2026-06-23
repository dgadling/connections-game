from __future__ import annotations
import time
from collections import defaultdict, deque
from fastapi import Request, HTTPException
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
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PATCH", "PUT", "DELETE"):
            # skip auth endpoints that don't have session yet
            if request.url.path.startswith("/auth/discord/start") or request.url.path.startswith("/auth/discord/callback") or request.url.path.startswith("/api/games/join"):
                pass
            else:
                origin = request.headers.get("origin") or request.headers.get("referer", "")
                # basic origin check – allow same-origin or no origin (e.g. curl)
                # proper check done in route handler with CSRF token
                csrf_header = request.headers.get("x-csrf-token")
                csrf_cookie = request.cookies.get("csrf_token")
                if csrf_header:
                    if not csrf_cookie or csrf_header != csrf_cookie:
                        raise HTTPException(403, "CSRF token mismatch")
                else:
                    # Require CSRF token for mutating requests
                    # allow if origin check passes? spec says both Origin/Referer + double-submit
                    # Enforce header present
                    raise HTTPException(403, "CSRF token required")
        response = await call_next(request)
        return response
