"""
YouTube: channel search, and which videos the embedded player may play.

Called by `backend/routes/sources.py` (search when adding a source) and by
`backend/routes/articles.py` (embedding check after a refresh).

Videos themselves arrive through each channel's official Atom feed, read by
`feeds.py`, and play in YouTube's own embedded player. Nothing here touches
video files.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import json
import os
import re

import httpx


FEED_URL = "https://www.youtube.com/feeds/videos.xml"
SEARCH_URL = "https://www.youtube.com/results"
VIDEOS_API_URL = "https://www.googleapis.com/youtube/v3/videos"

API_KEY_VARIABLE = "VAO2_YOUTUBE_API_KEY"

TIMEOUT = 10
MAX_CHANNELS = 20

# The "channels only" filter of YouTube's search page.
CHANNEL_FILTER = "EgIQAg=="

# The search page embeds its results as a JavaScript object.
INITIAL_DATA = re.compile(r"(?:var\s+)?ytInitialData\s*=\s*({.+?});\s*</script>", re.DOTALL)

# The Data API answers up to 50 videos per request, for one quota unit.
VIDEOS_PER_REQUEST = 50


#/////////////////////////////////////////////////////////
# CHANNEL SEARCH /////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _find_channel_renderers(value):
    """Every "channelRenderer" object, at any depth of the search page data."""
    renderers = []

    if isinstance(value, dict):
        if isinstance(value.get("channelRenderer"), dict):
            renderers.append(value["channelRenderer"])

        for child in value.values():
            renderers.extend(_find_channel_renderers(child))

    elif isinstance(value, list):
        for child in value:
            renderers.extend(_find_channel_renderers(child))

    return renderers


def _label(value):
    """The text of a YouTube label, given either as simpleText or as runs."""
    if not isinstance(value, dict):
        return ""

    if value.get("simpleText"):
        return value["simpleText"]

    parts = []
    for run in value.get("runs", []):
        parts.append(run.get("text", ""))

    return "".join(parts)


def _channel_from_renderer(renderer):
    channel_id = renderer.get("channelId")
    if not channel_id:
        return None

    thumbnails = renderer.get("thumbnail", {}).get("thumbnails", [])
    thumbnail = thumbnails[-1].get("url", "") if thumbnails else ""
    if thumbnail.startswith("//"):
        thumbnail = f"https:{thumbnail}"

    # YouTube puts the subscriber count in either of these two labels.
    subscribers = "Subscriber count hidden"
    for count_label in (renderer.get("subscriberCountText"), renderer.get("videoCountText")):
        text = _label(count_label)
        if "subscriber" in text.lower():
            subscribers = text
            break

    description = _label(renderer.get("descriptionSnippet"))
    subtitle = f"{subscribers} / {description}" if description else subscribers

    return {
        "channel_id": channel_id,
        "title": _label(renderer.get("title")) or channel_id,
        "subscribers": subscribers,
        "description": subtitle,
        "thumbnail": thumbnail,
        "url": f"https://www.youtube.com/channel/{channel_id}",
        "feed_url": f"{FEED_URL}?channel_id={channel_id}",
    }


async def search_channels(query):
    """YouTube channels matching a search, read from YouTube's own search page."""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Vao2/1.0)",
        "Accept-Language": "en,fr;q=0.8",
    }

    async with httpx.AsyncClient(timeout=TIMEOUT, headers=headers) as client:
        response = await client.get(
            SEARCH_URL,
            params={"search_query": query, "sp": CHANNEL_FILTER},
        )
        response.raise_for_status()

    match = INITIAL_DATA.search(response.text)
    if not match:
        raise RuntimeError("YouTube returned no usable search results")

    page_data = json.loads(match.group(1))

    channels = []
    for renderer in _find_channel_renderers(page_data)[:MAX_CHANNELS]:
        channel = _channel_from_renderer(renderer)
        if channel:
            channels.append(channel)

    return channels


#/////////////////////////////////////////////////////////
# EMBEDDING STATUS ///////////////////////////////////////
#/////////////////////////////////////////////////////////
def youtube_api_key():
    """The optional YouTube Data API key, or an empty string."""
    return os.environ.get(API_KEY_VARIABLE, "").strip()


async def embeddable_statuses(video_ids, api_key):
    """
    Ask the YouTube Data API which videos the embedded player may play.

    Returns {video_id: True/False} for the videos the API answered. A deleted or
    private video is simply missing from the answer. On any failure the
    statuses gathered so far are returned: the player in the browser still
    reports refusals on its own.
    """
    unique_ids = list(dict.fromkeys(video_ids))
    statuses = {}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for start in range(0, len(unique_ids), VIDEOS_PER_REQUEST):
            batch = unique_ids[start:start + VIDEOS_PER_REQUEST]

            try:
                response = await client.get(VIDEOS_API_URL, params={
                    "part": "status",
                    "id": ",".join(batch),
                    "key": api_key,
                })
                response.raise_for_status()
            except httpx.HTTPError:
                # Not re-raised: the exception holds the URL, and the URL the key.
                break

            for item in response.json().get("items", []):
                embeddable = item.get("status", {}).get("embeddable")
                if isinstance(embeddable, bool):
                    statuses[item["id"]] = embeddable

    return statuses
