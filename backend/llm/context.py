import ipaddress
import re
from urllib.parse import urlparse

import httpx
import trafilatura
from youtube_transcript_api import YouTubeTranscriptApi


MAX_CONTENT_LENGTH = 12000
VIDEO_ID_PATTERN = re.compile(r"(?:embed/|watch\?v=|youtu\.be/)([\w-]{11})")


def _video_id(article):
    for value in (article.get("media_url", ""), article.get("url", "")):
        match = VIDEO_ID_PATTERN.search(value)
        if match:
            return match.group(1)
    return None


def _transcript(article):
    video_id = _video_id(article)
    if not video_id:
        return ""
    transcript = YouTubeTranscriptApi().fetch(video_id, languages=("fr", "en"))
    return " ".join(snippet.text for snippet in transcript)[:MAX_CONTENT_LENGTH]


def _safe_web_url(value):
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.hostname == "localhost":
        return False
    try:
        return not ipaddress.ip_address(parsed.hostname).is_private
    except ValueError:
        return True


def _article_text(url):
    if not _safe_web_url(url):
        return ""
    response = httpx.get(
        url,
        timeout=15,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; Vao2/1.0)"},
    )
    response.raise_for_status()
    if not _safe_web_url(str(response.url)):
        return ""
    text = trafilatura.extract(
        response.text,
        include_comments=False,
        include_images=False,
        include_links=False,
        favor_precision=True,
    )
    return (text or "")[:MAX_CONTENT_LENGTH]


def article_context(article):
    """Return (content, source) using one platform-specific enrichment."""
    try:
        if article.get("platform") == "youtube":
            content = _transcript(article)
            if content:
                return content, "transcript"
        else:
            content = _article_text(article["url"])
            if content:
                return content, "webpage"
    except Exception:
        pass

    return article.get("summary", ""), "feed"
