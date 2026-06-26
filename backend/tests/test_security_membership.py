"""
Test that all /api/games/{game_id}/* routes enforce membership checks.

This prevents data leaks if a new route is added without calling require_membership().
"""
import inspect
from fastapi.routing import APIRoute
from app.main import app


def test_all_game_routes_require_membership():
    """Ensure every /api/games/{game_id}/* endpoint calls require_membership or require_game_admin."""

    # Routes that legitimately don't need membership (no game_id param, or public join)
    EXEMPT_PATHS = {
        "/api/games",  # POST create, GET list
    }
    EXEMPT_ENDPOINT_NAMES = {
        "join_game",  # POST /api/games/join - invite token based, no game_id in path
        "create_game",
        "list_games",
    }

    failures = []

    def iter_routes():
        """Yield APIRoute objects from app, walking into _IncludedRouter wrappers (FastAPI 0.138+)."""
        for route in app.routes:
            if isinstance(route, APIRoute):
                yield route
                continue
            # FastAPI 0.138+ wraps included routers in _IncludedRouter
            orig = getattr(route, "original_router", None)
            if orig and hasattr(orig, "routes"):
                for sub in orig.routes:
                    if isinstance(sub, APIRoute):
                        yield sub

    for route in iter_routes():

        path = route.path

        # Only check routes under /api/games/{game_id}
        if "{game_id}" not in path:
            continue

        # Skip exempt paths
        if path in EXEMPT_PATHS:
            continue

        endpoint = route.endpoint
        endpoint_name = getattr(endpoint, "__name__", str(endpoint))

        if endpoint_name in EXEMPT_ENDPOINT_NAMES:
            continue

        # Get source code
        try:
            source = inspect.getsource(endpoint)
        except (OSError, TypeError):
            # Built-ins / C extensions - skip
            continue

        # Check for membership enforcement
        has_membership_check = (
            "require_membership" in source
            or "require_game_admin" in source  # calls require_membership internally
        )

        if not has_membership_check:
            failures.append(f"{route.methods} {path} -> {endpoint_name}() missing membership check")

    assert not failures, "Game routes missing membership enforcement:\n" + "\n".join(failures)


# TDD verification: test correctly caught a fake route without membership check
# during development (evil_endpoint at /api/games/{game_id}/evil_test_no_membership),
# failing with: AssertionError: Game routes missing membership enforcement:
#   {'GET'} /api/games/{game_id}/evil_test_no_membership -> evil_endpoint() missing membership check
