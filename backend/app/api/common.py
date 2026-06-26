# Shared helpers for API routers
from __future__ import annotations
import re
from fastapi import HTTPException
from sqlalchemy.orm import Session
from .. import models
from ..auth import require_membership
from ..timeutil import utc_timestamp


def validate_discord_id(discord_id: str) -> str:
    """Validate Discord snowflake OR username.
    Returns normalized ID (username without leading @, snowflake unchanged).
    """
    if not discord_id:
        raise HTTPException(400, "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)")
    if len(discord_id) > 64:
        raise HTTPException(400, "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)")
    # Strip leading @ for usernames
    normalized = discord_id.lstrip("@")
    if not normalized:
        raise HTTPException(400, "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)")
    # Numeric snowflake path (back-compat)
    if re.match(r'^\d{17,20}$', normalized):
        try:
            sid = int(normalized)
            ts = ((sid >> 22) + 1420070400000) / 1000
            now = utc_timestamp()
            if ts < 1420070400 or ts > now + 86400:
                raise HTTPException(400, "That doesn't look like a Discord ID — see https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID")
        except ValueError as e:
            raise HTTPException(400, "Invalid Discord ID") from e
        return normalized
    # Username/handle path
    # Discord usernames: 2-32 chars, a-z0-9_., no consecutive dots
    if re.match(r'^(?!.*\.\.)[\w.]{2,32}$', normalized):
        return normalized
    raise HTTPException(400, "Discord ID must be a numeric snowflake (17-20 digits) or a username (2-32 chars, letters/numbers/_/.)")


def validate_discord_id_optional(discord_id: str | None) -> str | None:
    """Validate Discord ID if provided, else return None."""
    if discord_id is None:
        return None
    discord_id = discord_id.strip()
    if not discord_id:
        return None
    return validate_discord_id(discord_id)


def validate_discord_role_id(role_id: str | None) -> str | None:
    """Validate Discord role snowflake (17-20 digits), allow None/empty to clear."""
    if role_id is None:
        return None
    role_id = role_id.strip()
    if not role_id:
        return None
    if not re.match(r'^\d{17,20}$', role_id):
        raise HTTPException(400, "Discord role ID must be a numeric snowflake (17-20 digits)")
    return role_id


def require_game_admin(game_id: int, discord_id: str, db: Session):
    # Game membership = admin access. Superuser bypass is in require_membership.
    mem = require_membership(game_id, discord_id, db)
    return mem


def require_game_writable(game_id: int, db: Session):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if game and game.archived_at is not None:
        raise HTTPException(403, "game is archived")
    return game
