"""
Reader mode: show an article inside Vao2 instead of opening its site.

Called by `backend/routes/reader.py` when a feed card's "Read" is clicked.

    1. A Google News link is resolved to the publisher's URL (google_news.py).
    2. The page is downloaded with one honest request (fetch.py).
    3. The article is extracted and cleaned of ads (extract.py).
    4. The result is returned as a payload the frontend paints.

When the publisher refuses, the payload says so and the frontend offers a link
to the original page. This module never works around a refusal (no fake
browser identity, no archived copy).
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import time
from urllib.parse import urlparse

from backend.platforms.reader.extract import extract_article
from backend.platforms.reader.fetch import fetch_page, is_consent_page
from backend.platforms.reader.google_news import (
    is_google_news_url,
    resolve_google_news_url,
)


# Below this many words, the page was probably a teaser or a paywall.
MIN_READABLE_WORDS = 60

CACHE_TTL = 600
CACHE_MAX = 120
_cache = {}


#/////////////////////////////////////////////////////////
# CACHE //////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _cached(url):
    entry = _cache.get(url)
    if not entry:
        return None

    stored_at, payload = entry
    if time.monotonic() - stored_at > CACHE_TTL:
        _cache.pop(url, None)
        return None

    return payload


def _remember(url, payload):
    # A read that found nothing is not kept: rate limits pass.
    if not payload["words"]:
        return

    if len(_cache) >= CACHE_MAX:
        oldest = min(_cache, key=lambda key: _cache[key][0])
        _cache.pop(oldest, None)

    _cache[url] = (time.monotonic(), payload)


#/////////////////////////////////////////////////////////
# RESPONSE PAYLOAD ///////////////////////////////////////
#/////////////////////////////////////////////////////////
def _reading_status(words):
    if words >= MIN_READABLE_WORDS:
        return "ok"

    if words:
        return "partial"

    return "blocked"


def _payload(article, requested_url, note):
    """The shape the frontend reader expects, filled from what was read."""
    url = article.get("url") or requested_url
    domain = (urlparse(url).hostname or "").removeprefix("www.")
    words = article.get("words", 0)

    return {
        "url": url,
        "requested_url": requested_url,
        "domain": domain,
        "site": article.get("site") or domain,
        "title": article.get("title", ""),
        "byline": article.get("byline", ""),
        "published_at": article.get("published_at", ""),
        "lead_image": article.get("lead_image", ""),
        "summary": article.get("summary", ""),
        "blocks": article.get("blocks", []),
        "words": words,
        "blocked": article.get("blocked", 0),
        "status": _reading_status(words),
        "note": note,
    }


def _unreadable(url, reason):
    """A payload with no article, explaining why."""
    return _payload({"url": url}, url, f"{reason} Open the original page to continue.")


#/////////////////////////////////////////////////////////
# READING ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
async def read_source(url):
    """Read one public page, or report the publisher's refusal unchanged."""
    cached = _cached(url)
    if cached is not None:
        return cached

    target_url = url

    if is_google_news_url(url):
        target_url = await resolve_google_news_url(url)

        if is_google_news_url(target_url):
            return _unreadable(url, "The publisher link could not be resolved.")

    html, final_url, refusal = await fetch_page(target_url)

    if refusal:
        sentence = refusal[0].upper() + refusal[1:] + "."
        return _unreadable(target_url, sentence)

    article = extract_article(html, final_url)

    article_text = "\n".join(block.get("text", "") for block in article["blocks"])
    landed_on_consent_page = (
        is_consent_page(article.get("title", ""), final_url)
        or is_consent_page(article_text, final_url)
    )
    if landed_on_consent_page:
        return _unreadable(target_url, "A consent page was returned instead of the article.")

    if not article["words"]:
        return _unreadable(target_url, "No readable public text was found.")

    payload = _payload(article, target_url, "Read from the public page.")
    _remember(url, payload)
    return payload
