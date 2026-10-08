"""
Download and read the RSS or Atom feed of a source.

Called by `backend/routes/articles.py` when the feed is refreshed. Every source
in Vao2 is a feed: YouTube channels publish an official Atom feed, and news
sources are RSS feeds (an outlet's own, or a Google News search).

Returns plain dictionaries ready for `db.save_articles()`.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import re
from datetime import datetime, timezone
from html import unescape

import feedparser
import httpx


MAX_ENTRIES = 30
TIMEOUT = 10
USER_AGENT = "Vao2/1.0"

IMAGE_IN_HTML = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)
YOUTUBE_VIDEO_LINK = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([\w-]{11})",
    re.IGNORECASE,
)

# Where a YouTube description stops describing the video and starts promoting
# the channel. Everything from the first of these on is dropped.
PROMOTION_MARKERS = (
    "tts donations",
    "follow me",
    "merch",
    "memberships",
    "streamlabs.com",
    "instagram.com",
    "snapchat.com",
)


#/////////////////////////////////////////////////////////
# FIELD CLEANING /////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _plain_text(value, limit=400):
    """Feed HTML turned into one line of text, cut at a word boundary."""
    value = unescape(value or "")
    value = value.replace("\xa0\xa0", " - ")

    without_tags = re.sub(r"<[^>]+>", " ", value)
    text = " ".join(without_tags.split())

    if len(text) <= limit:
        return text

    cut = text[:limit].rsplit(" ", 1)[0]
    return f"{cut}..."


def _published_at(entry):
    for field in ("published_parsed", "updated_parsed", "created_parsed"):
        value = entry.get(field)
        if value:
            published = datetime(*value[:6], tzinfo=timezone.utc)
            return published.isoformat(timespec="seconds")

    return None


def _summary(entry):
    content = entry.get("content")
    if content:
        text = content[0].get("value", "")
    else:
        text = entry.get("summary", "")

    is_youtube_video = bool(entry.get("yt_videoid"))
    if is_youtube_video:
        lowered = text.lower()

        positions = []
        for marker in PROMOTION_MARKERS:
            if marker in lowered:
                positions.append(lowered.find(marker))

        if positions:
            text = text[:min(positions)]

    return _plain_text(text)


def _image_url(entry):
    thumbnails = entry.get("media_thumbnail") or entry.get("media_content") or []

    for media in thumbnails:
        if media.get("url"):
            return media["url"]

    match = IMAGE_IN_HTML.search(entry.get("summary", ""))
    if match:
        return match.group(1)

    return ""


def _media(entry):
    """(media_type, media_url) of the entry: a YouTube embed, audio, video or nothing."""
    video_id = entry.get("yt_videoid")

    if not video_id:
        match = YOUTUBE_VIDEO_LINK.search(entry.get("link", ""))
        if match:
            video_id = match.group(1)

    if video_id:
        return "youtube", f"https://www.youtube-nocookie.com/embed/{video_id}"

    for link in entry.get("links") or []:
        if link.get("rel") != "enclosure" or not link.get("href"):
            continue

        mime_type = link.get("type", "")

        if mime_type.startswith("audio/"):
            return "audio", link["href"]

        if mime_type.startswith("video/"):
            return "video", link["href"]

    return "", ""


#/////////////////////////////////////////////////////////
# FEED READING ///////////////////////////////////////////
#/////////////////////////////////////////////////////////
def parse_entries(raw_feed):
    """Convert an RSS or Atom document into article dictionaries."""
    articles = []

    for entry in feedparser.parse(raw_feed).entries[:MAX_ENTRIES]:
        url = entry.get("link") or entry.get("id") or ""
        title = _plain_text(entry.get("title", ""), 300)

        if not url or not title:
            continue

        media_type, media_url = _media(entry)

        articles.append({
            "guid": entry.get("id") or url,
            "url": url,
            "title": title,
            "summary": _summary(entry),
            "image_url": _image_url(entry),
            "author": _plain_text(entry.get("author", ""), 120),
            "media_type": media_type,
            "media_url": media_url,
            "published_at": _published_at(entry),
        })

    return articles


async def fetch_feed(feed_url):
    """Download and parse one RSS or Atom feed."""
    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        response = await client.get(feed_url)
        response.raise_for_status()

    return parse_entries(response.content)
