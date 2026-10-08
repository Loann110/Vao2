"""
Download one public web page for the reader.

Called by `preview.py`. Every redirect hop is checked before it is followed, so a
link can never lead the server to a private address (localhost, the local
network). When the publisher refuses, the refusal is reported as it is:
nothing here retries with another identity or another copy of the page.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import asyncio
import ipaddress
import socket
import unicodedata
from urllib.parse import urlparse

import httpx


USER_AGENT = "Mozilla/5.0 (compatible; Vao2/2.0; local research assistant)"

TIMEOUT = 15
MAX_REDIRECTS = 5

# News templates put the article first and megabytes of widgets after it, so a
# large page is cut rather than refused.
MAX_BYTES = 6_000_000

# What an edge filter answers to something it took for a robot. A 404 is not
# here: that is the publisher's real answer.
REFUSED_STATUS = {
    401, 402, 403, 405, 406, 409, 418, 429, 451,
    500, 502, 503, 520, 521, 522, 526,
}

CONSENT_HOSTS = {"consent.youtube.com", "consent.yahoo.com"}

CONSENT_HEADINGS = (
    "before you continue to google",
    "before you continue to youtube",
    "avant d'acceder a google",
    "avant d’acceder a google",
    "avant de continuer vers google",
    "avant d'acceder a youtube",
)


#/////////////////////////////////////////////////////////
# SAFETY CHECKS //////////////////////////////////////////
#/////////////////////////////////////////////////////////
async def host_is_public(hostname):
    """Whether every address behind this name is on the public internet."""
    try:
        records = await asyncio.to_thread(
            socket.getaddrinfo,
            hostname,
            443,
            type=socket.SOCK_STREAM,
        )
    except OSError:
        return False

    addresses = set()
    for record in records:
        address = record[4][0]
        # IPv6 link-local addresses carry a "%interface" suffix.
        address = address.split("%", 1)[0]
        addresses.add(address)

    if not addresses:
        return False

    try:
        for address in addresses:
            if not ipaddress.ip_address(address).is_global:
                return False
    except ValueError:
        return False

    return True


def _without_accents(text):
    decomposed = unicodedata.normalize("NFKD", str(text).casefold())

    letters = []
    for character in decomposed:
        if not unicodedata.combining(character):
            letters.append(character)

    return "".join(letters)


def is_consent_page(text, url=""):
    """Recognise a cookie wall, not an article that merely talks about cookies."""
    host = (urlparse(url).hostname or "").lower()

    if host.startswith("consent.google.") or host in CONSENT_HOSTS:
        return True

    opening = " ".join(_without_accents(text or "").split())[:1200]

    for heading in CONSENT_HEADINGS:
        if opening.startswith(heading):
            return True

    return (
        opening.startswith("we use cookies and data")
        and "deliver and maintain google services" in opening
    )


#/////////////////////////////////////////////////////////
# PAGE DOWNLOAD //////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _request_headers():
    return {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    }


async def _refusal_before_request(url):
    """Why this URL must not be requested, or an empty string when it may."""
    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return "this link does not point at a public web page"

    if not await host_is_public(parsed.hostname):
        return "this address is not reachable on the public web"

    if is_consent_page("", url):
        return "the link leads to a consent page, not the article"

    return ""


def _refusal_in_response(response):
    """Why this response cannot be read, or an empty string when it can."""
    status = response.status_code

    if status in REFUSED_STATUS:
        return f"the site refused automated reading (HTTP {status})"

    if status >= 400:
        return f"the page is unavailable (HTTP {status})"

    content_type = response.headers.get("content-type", "").casefold()
    if "html" not in content_type:
        return "this source is not a web page"

    return ""


async def fetch_page(url):
    """
    Download a page, following redirects one hop at a time.

    Returns (html_bytes, final_url, refusal). `refusal` is a short phrase naming
    why the page could not be read, and empty when it could.
    """
    current_url = url

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            refusal = await _refusal_before_request(current_url)
            if refusal:
                return b"", current_url, refusal

            try:
                response = await client.get(current_url, headers=_request_headers())
            except httpx.HTTPError:
                return b"", current_url, "the site did not respond"

            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    return b"", current_url, "the site returned an invalid redirect"

                current_url = str(response.url.join(location))
                continue

            final_url = str(response.url)

            refusal = _refusal_in_response(response)
            if refusal:
                return b"", final_url, refusal

            return response.content[:MAX_BYTES], final_url, ""

    return b"", current_url, "the site redirected too many times"
