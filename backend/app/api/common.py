# Shared helpers for API routers
from __future__ import annotations
from fastapi import HTTPException
from sqlalchemy.orm import Session
from .. import models
from ..auth import require_membership
from .. import validators as v


def validate_discord_id(discord_id: str) -> str:
    """Validate Discord snowflake OR username.
    Returns normalized ID. Raises HTTPException(400) on error.
    Kept for route-level backward compatibility; prefer Pydantic validation in schemas.
    """
    try:
        return v.normalize_discord_id(discord_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


def validate_discord_id_optional(discord_id: str | None) -> str | None:
    """Validate Discord ID if provided, else return None."""
    try:
        return v.normalize_discord_id_optional(discord_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


def validate_discord_role_id(role_id: str | None) -> str | None:
    """Validate Discord role snowflake (17-20 digits), allow None/empty to clear."""
    try:
        return v.normalize_discord_role_id(role_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


def require_game_admin(game_id: int, discord_id: str, db: Session):
    # Game membership = admin access. Superuser bypass is in require_membership.
    mem = require_membership(game_id, discord_id, db)
    return mem


def require_game_writable(game_id: int, db: Session):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if game and game.archived_at is not None:
        raise HTTPException(403, "game is archived")
    return game
