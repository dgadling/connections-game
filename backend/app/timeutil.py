from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    """
    Return current UTC time as a naive datetime.

    Convention for this codebase:
    - All timestamps stored in the database are naive datetimes representing UTC.
    - Never store timezone-aware datetimes in the DB.
    - Use utcnow() everywhere instead of datetime.utcnow() or
      datetime.now(timezone.utc).replace(tzinfo=None) to ensure consistency.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_timestamp() -> float:
    """Return current UTC timestamp (seconds since epoch), correctly handling TZ."""
    return datetime.now(timezone.utc).timestamp()


def serialize_datetime(dt: datetime | None) -> str | None:
    """
    Serialize a datetime to ISO8601 with 'Z' suffix for UTC.

    - Input is expected to be a naive UTC datetime (as stored in DB).
    - If a timezone-aware datetime is passed, it is converted to UTC first.
    - Returns None if dt is None.
    - Output format: YYYY-MM-DDTHH:MM:SS[.ffffff]Z
      (microseconds included only if non-zero, matching datetime.isoformat())
    - The 'Z' suffix ensures JavaScript's new Date() parses it as UTC,
      not local time. Never omit the Z.

    Example:
        serialize_datetime(datetime(2026, 6, 24, 19, 0, 0))
        -> "2026-06-24T19:00:00Z"
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"
