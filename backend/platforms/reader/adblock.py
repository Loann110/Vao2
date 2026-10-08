"""
Remove advertising from what the reader displays.

Two things are dropped from an extracted article:

- images served by an advertising or tracking host (a tracking pixel is an
  image, and left alone it reports every opening of the article);
- the labels of sponsored inserts ("Advertisement", "Sponsored content"...),
  which extraction keeps as faithfully as the article's own words.

The lists are short on purpose: each entry is a network whose only business is
advertising or analytics, so nothing a reader wants is dropped by accident.

Called by `extract.py`.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import re
from urllib.parse import urlparse


# Matched against the host and each of its parent domains, so
# "ads.example.doubleclick.net" is caught by "doubleclick.net".
AD_HOSTS = frozenset({
    # Google advertising and measurement
    "doubleclick.net", "googlesyndication.com", "googleadservices.com",
    "googletagmanager.com", "googletagservices.com", "google-analytics.com",
    "adservice.google.com",

    # Other ad networks and exchanges
    "adnxs.com", "adsrvr.org", "amazon-adsystem.com", "criteo.com", "criteo.net",
    "openx.net", "pubmatic.com", "rubiconproject.com", "casalemedia.com",
    "taboola.com", "outbrain.com", "sharethrough.com", "smartadserver.com",
    "teads.tv", "33across.com", "media.net", "adform.net", "yieldmo.com",
    "indexww.com", "bidswitch.net", "everesttech.net", "moatads.com",

    # Analytics and behaviour recording
    "scorecardresearch.com", "quantserve.com", "chartbeat.com", "chartbeat.net",
    "hotjar.com", "mouseflow.com", "fullstory.com", "mixpanel.com",
    "segment.com", "segment.io", "branch.io", "amplitude.com",
    "krxd.net", "demdex.net", "omtrdc.net", "adobedtm.com",

    # Social tracking pixels
    "connect.facebook.net", "ct.pinterest.com", "analytics.twitter.com",
    "ads-twitter.com", "t.co",

    # Consent managers that exist to carry the above
    "cookielaw.org", "onetrust.com", "quantcast.mgr.consensu.org",
    "sourcepoint.mgr.consensu.org", "privacy-mgmt.com",
})

# Matched in the path or query. Each reads as advertising in any context,
# which a bare word like "ad" would not.
AD_PATH_MARKERS = (
    "/adserver", "/ad-server", "/adchoices", "/doubleclick",
    "/pagead/", "/ad_frame", "/adframe", "/banner-ad", "/sponsorads",
    "/pixel.gif", "/tracking-pixel", "/trackingpixel", "/beacon.gif",
    "/__utm.gif", "/collect?", "/piwik.php", "/matomo.php",
    "facebook.com/tr",
)

# Anchored to the whole block, so an article *about* advertising keeps its
# own sentences: only a short standalone label matches.
SPONSORED_LABEL = re.compile(
    r"^\s*(?:"
    r"advertisements?|publicit[ée]s?|werbung|pubblicit[àa]|anuncio"
    r"|sponsored(?:\s+(?:content|by|links?|post|story))?"
    r"|paid\s+(?:content|post|partnership)"
    r"|promoted(?:\s+(?:content|links?|stories))?"
    r"|contenu\s+sponsoris[ée]|article\s+sponsoris[ée]|en\s+partenariat\s+avec"
    r"|presented\s+by|brought\s+to\s+you\s+by"
    r"|from\s+our\s+(?:partners?|advertisers?)"
    r"|recommended\s+for\s+you|around\s+the\s+web|you\s+may\s+(?:also\s+)?like"
    r")\b\s*[:\-–—]?\s*$",
    re.IGNORECASE,
)

MAX_LABEL_LENGTH = 80


#/////////////////////////////////////////////////////////
# MATCHING ///////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _host_and_parents(host):
    """'a.b.example.com' gives 'a.b.example.com', 'b.example.com', 'example.com'."""
    parts = host.split(".")

    domains = []
    for index in range(len(parts) - 1):
        domains.append(".".join(parts[index:]))

    return domains


def is_ad_url(url):
    """Whether loading this URL would reach an advertising or tracking service."""
    if not isinstance(url, str) or not url.strip():
        return False

    candidate = url.strip()
    if candidate.startswith("//"):
        candidate = f"https:{candidate}"

    # A data: or relative URL reaches no third party on its own.
    if not candidate.lower().startswith(("http://", "https://")):
        return False

    try:
        parsed = urlparse(candidate)
    except ValueError:
        return False

    host = (parsed.hostname or "").lower()
    if not host:
        return False

    for domain in _host_and_parents(host):
        if domain in AD_HOSTS:
            return True

    location = f"{host}{parsed.path}?{parsed.query}".lower()
    for marker in AD_PATH_MARKERS:
        if marker in location:
            return True

    return False


def is_sponsored_label(text):
    """Whether a text block is a sponsored insert's label rather than prose."""
    stripped = (text or "").strip()

    if not stripped or len(stripped) > MAX_LABEL_LENGTH:
        return False

    return bool(SPONSORED_LABEL.match(stripped))


#/////////////////////////////////////////////////////////
# FILTERING //////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def remove_ads(blocks):
    """
    Drop advertising from extracted reader blocks.

    Returns (kept_blocks, removed_count): the reader says how many it removed
    rather than silently editing what the publisher sent.
    """
    kept_blocks = []
    removed_count = 0

    for block in blocks:
        if block["type"] == "image":
            is_ad = is_ad_url(block.get("url", ""))
        else:
            is_ad = is_sponsored_label(block.get("text", ""))

        if is_ad:
            removed_count += 1
            continue

        kept_blocks.append(block)

    return kept_blocks, removed_count
