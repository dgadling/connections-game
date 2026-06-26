"""Pure validation helpers (no FastAPI / HTTPException).

Used by Pydantic schemas and by api/common (which wraps ValueError -> HTTPException).
"""
from __future__ import annotations
import re
import time

DISCORD_ID_ERROR = "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)"


def normalize_discord_id(discord_id: str) -> str:
    """Validate Discord snowflake OR username. Returns normalized ID.
    Raises ValueError on invalid input.
    """
    if not discord_id:
        raise ValueError(DISCORD_ID_ERROR)
    if len(discord_id) > 64:
        raise ValueError(DISCORD_ID_ERROR)
    normalized = discord_id.lstrip("@")
    if not normalized:
        raise ValueError(DISCORD_ID_ERROR)
    # Numeric snowflake
    if re.match(r'^\d{17,20}$', normalized):
        try:
            sid = int(normalized)
            ts = ((sid >> 22) + 1420070400000) / 1000
            now = time.time()
            if ts < 1420070400 or ts > now + 86400:
                raise ValueError("That doesn't look like a Discord ID — see https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID")
        except ValueError as e:
            # re-raise with consistent message
            if str(e).startswith("That doesn't"):
                raise
            raise ValueError("Invalid Discord ID") from e
        return normalized
    # Username/handle
    if re.match(r'^(?!.*\.\.)[\w.]{2,32}$', normalized):
        return normalized
    raise ValueError(DISCORD_ID_ERROR)


def normalize_discord_id_optional(discord_id: str | None) -> str | None:
    """Validate Discord ID if provided, else return None.
    Empty/whitespace strings become None.
    """
    if discord_id is None:
        return None
    discord_id = discord_id.strip()
    if not discord_id:
        return None
    return normalize_discord_id(discord_id)


def normalize_discord_role_id(role_id: str | None) -> str | None:
    """Validate Discord role snowflake, allow None/empty to clear."""
    if role_id is None:
        return None
    role_id = role_id.strip()
    if not role_id:
        return None
    if not re.match(r'^\d{17,20}$', role_id):
        raise ValueError("Discord role ID must be a numeric snowflake (17-20 digits)")
    return role_id
