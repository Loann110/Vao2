from datetime import datetime
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree


YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml"
TIMEOUT = 10


def _get(url):
    request = Request(url, headers={"User-Agent": "Vao2/1.0"})
    with urlopen(request, timeout=TIMEOUT) as response:
        return response.read()


def search_channels(query, api_key, limit=20):
    """Return YouTube channels matching a search query."""
    params = urlencode(
        {
            "part": "snippet",
            "type": "channel",
            "maxResults": min(max(limit, 1), 50),
            "q": query,
            "key": api_key,
        }
    )
    data = json.loads(_get(f"{YOUTUBE_API_URL}?{params}"))
    channels = []

    for item in data.get("items", []):
        channel_id = item.get("id", {}).get("channelId")
        if not channel_id:
            continue

        snippet = item.get("snippet", {})
        thumbnails = snippet.get("thumbnails", {})
        thumbnail = (
            thumbnails.get("high")
            or thumbnails.get("medium")
            or thumbnails.get("default")
            or {}
        ).get("url", "")

        channels.append(
            {
                "channel_id": channel_id,
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "thumbnail": thumbnail,
                "url": f"https://www.youtube.com/channel/{channel_id}",
                "feed_url": f"{YOUTUBE_FEED_URL}?channel_id={channel_id}",
            }
        )

    return channels


def _text(element):
    return element.text.strip() if element is not None and element.text else ""


def _date(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def fetch_videos(channel_id):
    """Return the latest videos published by a YouTube channel."""
    url = f"{YOUTUBE_FEED_URL}?channel_id={channel_id}"
    root = ElementTree.fromstring(_get(url))
    namespaces = {
        "atom": "http://www.w3.org/2005/Atom",
        "media": "http://search.yahoo.com/mrss/",
        "yt": "http://www.youtube.com/xml/schemas/2015",
    }
    videos = []

    for entry in root.findall("atom:entry", namespaces):
        video_id = _text(entry.find("yt:videoId", namespaces))
        media = entry.find("media:group", namespaces)
        thumbnail = media.find("media:thumbnail", namespaces) if media is not None else None

        videos.append(
            {
                "video_id": video_id,
                "title": _text(entry.find("atom:title", namespaces)),
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "published_at": _date(_text(entry.find("atom:published", namespaces))),
                "description": _text(media.find("media:description", namespaces)) if media is not None else "",
                "thumbnail": thumbnail.get("url", "") if thumbnail is not None else "",
            }
        )

    return videos
