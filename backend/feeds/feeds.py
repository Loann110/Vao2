import re
from datetime import datetime, timezone

import feedparser
import httpx


MAX_ENTRIES = 30
TIMEOUT = 10
USER_AGENT = "Vao2/1.0"
IMAGE_PATTERN = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.I)
YOUTUBE_PATTERN = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([\w-]{11})",
    re.I,
)


def _clean(value, limit=400):
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value or "")).strip()
    return text if len(text) <= limit else f"{text[:limit].rsplit(' ', 1)[0]}..."


def _published(entry):
    for field in ("published_parsed", "updated_parsed", "created_parsed"):
        value = entry.get(field)
        if value:
            return datetime(*value[:6], tzinfo=timezone.utc).isoformat(timespec="seconds")
    return None


def _summary(entry):
    content = entry.get("content")
    value = content[0].get("value", "") if content else entry.get("summary", "")

    if entry.get("yt_videoid"):
        lowered = value.lower()
        markers = (
            "tts donations",
            "follow me",
            "merch",
            "memberships",
            "streamlabs.com",
            "instagram.com",
            "snapchat.com",
        )
        positions = [lowered.find(marker) for marker in markers if marker in lowered]
        if positions:
            value = value[: min(positions)]

    return _clean(value)


def _image(entry):
    for media in entry.get("media_thumbnail") or entry.get("media_content") or []:
        if media.get("url"):
            return media["url"]

    match = IMAGE_PATTERN.search(entry.get("summary", ""))
    return match.group(1) if match else ""


def _media(entry):
    video_id = entry.get("yt_videoid")
    if not video_id:
        match = YOUTUBE_PATTERN.search(entry.get("link", ""))
        video_id = match.group(1) if match else None
    if video_id:
        return "youtube", f"https://www.youtube-nocookie.com/embed/{video_id}"

    for link in entry.get("links") or []:
        if link.get("rel") != "enclosure" or not link.get("href"):
            continue
        mime = link.get("type", "")
        if mime.startswith("audio/"):
            return "audio", link["href"]
        if mime.startswith("video/"):
            return "video", link["href"]

    return "", ""


def parse_entries(raw):
    """Convert an RSS or Atom document into backend article dictionaries."""
    articles = []

    for entry in feedparser.parse(raw).entries[:MAX_ENTRIES]:
        url = entry.get("link") or entry.get("id") or ""
        title = _clean(entry.get("title", ""), 300)
        if not url or not title:
            continue

        media_type, media_url = _media(entry)
        articles.append(
            {
                "guid": entry.get("id") or url,
                "url": url,
                "title": title,
                "summary": _summary(entry),
                "image_url": _image(entry),
                "author": _clean(entry.get("author", ""), 120),
                "media_type": media_type,
                "media_url": media_url,
                "published_at": _published(entry),
            }
        )

    return articles


async def fetch_feed(url):
    """Download and parse one RSS or Atom feed."""
    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        return parse_entries(response.content)
