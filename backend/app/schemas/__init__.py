# SPDX-License-Identifier: GPL-3.0-or-later
from datetime import datetime, timezone
from typing import Annotated
from pydantic.functional_serializers import PlainSerializer


def _utc_isoformat(v: datetime) -> str:
    """Serialise naive (UTC) datetimes with +00:00 so browsers parse correctly."""
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.isoformat()


UTCDatetime = Annotated[datetime, PlainSerializer(_utc_isoformat)]
