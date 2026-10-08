"""
Fetch the full text behind an article, for the AI panel.

Called by `backend/routes/assistant.py` the first time an article is summarized
or questioned; the result is then stored with the article in the database.

    YouTube video  ->  its transcript                    (content_source = "transcript")
    news article   ->  the page's text, through the reader (content_source = "webpage")
    otherwise      ->  the feed's summary                (content_source = "feed")
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import asyncio
import re

from youtube_transcript_api import YouTubeTranscriptApi

from backend.platforms.reader.preview import read_source


# About 2,000 tokens: more would not fit in the local model's context anyway.
MAX_CONTENT_LENGTH = 12000

VIDEO_ID = re.compile(r"(?:embed/|watch\?v=|youtu\.be/)([\w-]{11})")

TRANSCRIPT_LANGUAGES = ("fr", "en")


#/////////////////////////////////////////////////////////
# YOUTUBE TRANSCRIPT /////////////////////////////////////
#/////////////////////////////////////////////////////////
def _video_id(article):
    for value in (article.get("media_url", ""), article.get("url", "")):
        match = VIDEO_ID.search(value)
        if match:
            return match.group(1)

    return None


def _transcript(article):
    video_id = _video_id(article)
    if not video_id:
        return ""

    transcript = YouTubeTranscriptApi().fetch(video_id, languages=TRANSCRIPT_LANGUAGES)

    lines = []
    for snippet in transcript:
        lines.append(snippet.text)

    return " ".join(lines)[:MAX_CONTENT_LENGTH]


#/////////////////////////////////////////////////////////
# WEB PAGE TEXT //////////////////////////////////////////
#/////////////////////////////////////////////////////////
async def _page_text(url):
    """The article's text as the reader extracts it (same safety checks, same refusals)."""
    page = await read_source(url)

    paragraphs = []
    for block in page["blocks"]:
        if block["type"] != "image":
            paragraphs.append(block["text"])

    return "\n".join(paragraphs)[:MAX_CONTENT_LENGTH]


#/////////////////////////////////////////////////////////
# CONTEXT ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
async def article_context(article):
    """Return (content, content_source) for the article."""
    try:
        if article.get("platform") == "youtube":
            # The transcript library is blocking: it runs in a worker thread.
            content = await asyncio.to_thread(_transcript, article)
            if content:
                return content, "transcript"
        else:
            content = await _page_text(article["url"])
            if content:
                return content, "webpage"

    # Any failure (no transcript, page refused, network) falls back to the feed.
    except Exception:
        pass

    return article.get("summary", ""), "feed"
