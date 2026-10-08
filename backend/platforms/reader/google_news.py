"""
Turn a Google News link into the publisher's own article URL.

News sources in Vao2 are Google News RSS feeds, so their article links point at
news.google.com rather than at the article. Google no longer puts the real URL
in the link: its article page carries a short-lived signature, which is
exchanged through Google's own resolver for the publisher URL.

Called by `preview.py` before the page is downloaded.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import json
import re
import time
from urllib.parse import urlparse

import httpx
from lxml import html as lxml_html

from backend.platforms.reader.fetch import USER_AGENT, host_is_public


TIMEOUT = 15

RESOLVER_URL = "https://news.google.com/_/DotsSplashUi/data/batchexecute"

# A resolved link does not change, so it is kept for a day.
CACHE_TTL = 86400
CACHE_MAX = 300
_resolved_urls = {}

ARTICLE_TOKEN = re.compile(r"/(?:rss/)?articles/([^/?]+)")


#/////////////////////////////////////////////////////////
# CACHE //////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _cached(url):
    entry = _resolved_urls.get(url)
    if not entry:
        return None

    stored_at, resolved = entry
    if time.monotonic() - stored_at > CACHE_TTL:
        return None

    return resolved


def _remember(url, resolved):
    if len(_resolved_urls) >= CACHE_MAX:
        oldest = min(_resolved_urls, key=lambda key: _resolved_urls[key][0])
        _resolved_urls.pop(oldest, None)

    _resolved_urls[url] = (time.monotonic(), resolved)


#/////////////////////////////////////////////////////////
# RESOLUTION /////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def is_google_news_url(url):
    host = urlparse(url).hostname or ""
    return host == "news.google.com" or host.endswith(".news.google.com")


async def _article_page(client, url):
    """The Google News article page, past the consent wall if one appears."""
    page = await client.get(url)
    document = lxml_html.fromstring(page.text)

    consent_forms = document.xpath("//form[@action='https://consent.google.com/save']")
    if not consent_forms:
        return document

    # The first form on the consent page is the "reject all" one.
    form = consent_forms[0]

    form_data = {}
    for field in form.xpath(".//input[@name]"):
        form_data[field.get("name")] = field.get("value", "")

    page = await client.post(form.get("action"), data=form_data)
    return lxml_html.fromstring(page.text)


def _resolver_request(token, timestamp, signature):
    """The body Google's resolver expects, as its own page sends it."""
    request = [
        "garturlreq",
        [
            [
                "en-US", "US", ["FINANCE_TOP_INDICES", "WEB_TEST_1_0_0"],
                None, None, 1, 1, "US:en", None, 180, None, None, None,
                None, None, 0, None, None, [1608992183, 723341000],
            ],
            "en-US", "US", 1, [2, 3, 4, 8], 1, 0, "655000234", 0, 0, None, 0,
        ],
        token,
        timestamp,
        signature,
    ]

    batch = [[["Fbv4je", json.dumps(request, separators=(",", ":")), None, "generic"]]]

    return {"f.req": json.dumps(batch, separators=(",", ":"))}


def _publisher_url(resolver_text):
    """Read the publisher URL out of the resolver's answer."""
    try:
        rows = json.loads((resolver_text or "").lstrip(")]}'\n "))
    except json.JSONDecodeError:
        return ""

    for row in rows:
        is_answer = (
            isinstance(row, list)
            and len(row) >= 3
            and row[:2] == ["wrb.fr", "Fbv4je"]
        )
        if not is_answer:
            continue

        try:
            result = json.loads(row[2])
        except (TypeError, json.JSONDecodeError):
            return ""

        if len(result) >= 2 and isinstance(result[1], str):
            return result[1]

    return ""


async def resolve_google_news_url(url):
    """
    The publisher URL behind a Google News link.

    Returns the link unchanged when it cannot be resolved, so the caller can tell
    by checking whether it still points at news.google.com.
    """
    if not is_google_news_url(url):
        return url

    cached = _cached(url)
    if cached:
        return cached

    match = ARTICLE_TOKEN.search(urlparse(url).path)
    if not match:
        return url

    token = match.group(1)

    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.8",
    }

    try:
        async with httpx.AsyncClient(
            timeout=TIMEOUT,
            follow_redirects=True,
            headers=headers,
        ) as client:
            document = await _article_page(client, url)

            signatures = document.xpath("//*[@data-n-a-sg]/@data-n-a-sg")
            timestamps = document.xpath("//*[@data-n-a-ts]/@data-n-a-ts")
            if not signatures or not timestamps:
                return url

            response = await client.post(
                RESOLVER_URL,
                params={"rpcids": "Fbv4je"},
                data=_resolver_request(token, int(timestamps[0]), signatures[0]),
            )
    except (httpx.HTTPError, ValueError, TypeError, UnicodeDecodeError):
        return url

    resolved = _publisher_url(response.text)
    if not resolved:
        return url

    hostname = urlparse(resolved).hostname
    if not hostname or not await host_is_public(hostname):
        return url

    _remember(url, resolved)
    return resolved
