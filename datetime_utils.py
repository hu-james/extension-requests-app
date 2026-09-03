"""Timezone-safe parsing helpers for API and Canvas timestamps."""

from datetime import datetime, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def timezone_from_name(name: str | None) -> tzinfo:
    """Return an IANA timezone, falling back to UTC for missing/invalid names."""
    if not name:
        return timezone.utc
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def parse_datetime_to_utc(value: str, default_timezone: tzinfo) -> datetime:
    """
    Parse an ISO timestamp and normalize it to UTC.

    Current clients send an explicit offset. A timezone-less value can still
    arrive from an older cached frontend, so interpret that wall-clock value in
    the Canvas course timezone instead of incorrectly treating it as UTC.
    """
    if not isinstance(value, str) or not value.strip():
        raise ValueError("A date and time value is required")

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=default_timezone)

    return parsed.astimezone(timezone.utc)
