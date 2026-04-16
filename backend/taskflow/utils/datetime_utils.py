from datetime import datetime

from taskflow.constants import UTC


def now_utc() -> datetime:
    return datetime.now(UTC)


def parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
