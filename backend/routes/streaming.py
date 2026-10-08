"""
Helpers for answers sent progressively, while the local model writes them.

A streamed answer is a series of JSON lines ("NDJSON"), one event per line:

    {"type": "status", "message": "Loading local AI…"}
    {"type": "delta", "text": "The article says"}
    {"type": "complete", ...}

The frontend reads them as they arrive (ia_box.js, weather.js). Used by
assistant.py and weather.py.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import json

from fastapi.responses import StreamingResponse


def event_line(event_type, **fields):
    """One event, as one line of JSON."""
    event = {"type": event_type, **fields}
    return json.dumps(event, ensure_ascii=False) + "\n"


def stream_response(events):
    """Send an async generator of event lines to the browser as they come."""
    return StreamingResponse(
        events,
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )
