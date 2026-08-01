from datetime import datetime
import json
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree


YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml"
TIMEOUT = 10


def _get(url):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; Vao2/1.0)",
            "Accept-Language": "en,fr;q=0.8",
        },
    )
    with urlopen(request, timeout=TIMEOUT) as response:
        return response.read()


def _find_renderers(value):
    renderers = []
    if isinstance(value, dict):
        if isinstance(value.get("channelRenderer"), dict):
            renderers.append(value["channelRenderer"])
        for child in value.values():
            renderers.extend(_find_renderers(child))
    elif isinstance(value, list):
        for child in value:
            renderers.extend(_find_renderers(child))
    return renderers


def _label(value):
    if not isinstance(value, dict):
        return ""
    if value.get("simpleText"):
        return value["simpleText"]
    return "".join(run.get("text", "") for run in value.get("runs", []))


def search_channels(query, limit=20):
    """Return YouTube channels matching a search query."""
    params = urlencode({"search_query": query, "sp": "EgIQAg=="})
    page = _get(f"https://www.youtube.com/results?{params}").decode("utf-8", "replace")
    match = re.search(
        r"(?:var\s+)?ytInitialData\s*=\s*({.+?});\s*</script>",
        page,
        re.S,
    )
    if not match:
        raise RuntimeError("YouTube returned no usable search results")

    data = json.loads(match.group(1))
    channels = []

    for item in _find_renderers(data)[: min(max(limit, 1), 50)]:
        channel_id = item.get("channelId")
        if not channel_id:
            continue

        thumbnails = item.get("thumbnail", {}).get("thumbnails", [])
        thumbnail = thumbnails[-1].get("url", "") if thumbnails else ""
        if thumbnail.startswith("//"):
            thumbnail = f"https:{thumbnail}"

        count_labels = (
            _label(item.get("subscriberCountText")),
            _label(item.get("videoCountText")),
        )
        subscribers = next(
            (label for label in count_labels if "subscriber" in label.lower()),
            "Subscriber count hidden",
        )
        description = _label(item.get("descriptionSnippet"))
        subtitle = " / ".join(value for value in (subscribers, description) if value)

        channels.append(
            {
                "channel_id": channel_id,
                "title": _label(item.get("title")) or channel_id,
                "subscribers": subscribers,
                "description": subtitle,
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
