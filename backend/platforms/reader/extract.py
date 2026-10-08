"""
Turn a downloaded page into the article the reader displays.

Called by `preview.py` with the HTML returned by `fetch.py`. trafilatura finds
the article inside the page; this module flattens it into a list of simple
blocks the frontend can paint in the app's own style:

    {"type": "text",    "text": "..."}
    {"type": "heading", "text": "...", "level": "2"}
    {"type": "quote",   "text": "..."}
    {"type": "list",    "text": "..."}       one list item
    {"type": "image",   "url": "...", "alt": "..."}

It never downloads anything itself.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import re
from urllib.parse import urljoin, urlparse

import trafilatura
from lxml import etree

from backend.platforms.reader.adblock import is_ad_url, remove_ads


MAX_BLOCKS = 200
MAX_BLOCK_CHARS = 1_600

# Below this many characters, the precise extraction probably missed the body
# of an unusual article template, and the more permissive one is tried.
ENOUGH_TEXT = 600

# Image ids inside CDN paths: long runs of hex digits containing a number.
ASSET_ID = re.compile(r"[0-9a-f]*[0-9][0-9a-f]{5,}", re.IGNORECASE)


def _clean(value, maximum):
    return " ".join(str(value or "").split())[:maximum]


def _text_length(text):
    """Length of the text with its whitespace collapsed."""
    return len(" ".join(text.split()))


def _absolute_image_url(value, page_url):
    if not value:
        return ""

    absolute = urljoin(page_url, _clean(value, 900))
    parsed = urlparse(absolute)

    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""

    return absolute


#/////////////////////////////////////////////////////////
# METADATA ///////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _metadata(html, page_url):
    """Title, author, date, site name, lead image and description of the page."""
    try:
        found = trafilatura.extract_metadata(html, default_url=page_url)
    except (TypeError, ValueError, AttributeError):
        found = None

    if not found:
        return {}

    return {
        "title": _clean(found.title, 300),
        "byline": _clean(found.author, 160),
        "published_at": _clean(found.date, 40),
        "site": _clean(found.sitename, 120),
        "lead_image": _absolute_image_url(found.image, page_url),
        "summary": _clean(found.description, 400),
    }


#/////////////////////////////////////////////////////////
# ARTICLE BODY ///////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _article_xml(html):
    """
    The article as trafilatura's XML, from the precise pass or the permissive one.

    The precise pass drops boilerplate but sometimes drops the whole body of an
    unfamiliar template, so a thin result is retried permissively and the longer
    of the two is kept.
    """
    best_xml = ""

    for mode in ({"favor_precision": True}, {"favor_recall": True}):
        try:
            xml = trafilatura.extract(
                html,
                output_format="xml",
                include_images=True,
                include_formatting=True,
                include_comments=False,
                include_links=False,
                include_tables=False,
                **mode,
            )
        except (TypeError, ValueError, AttributeError):
            xml = None

        xml = xml or ""
        if _text_length(xml) > _text_length(best_xml):
            best_xml = xml

        if _text_length(best_xml) >= ENOUGH_TEXT:
            break

    return best_xml


def _blocks_from_xml(xml, page_url, title):
    """Walk trafilatura's XML and collect the blocks in reading order."""
    if not xml:
        return []

    try:
        tree = etree.fromstring(xml.encode("utf-8"))
    except etree.XMLSyntaxError:
        return []

    blocks = []
    seen_images = set()
    folded_title = " ".join((title or "").casefold().split())

    def add_text(kind, node, level=None):
        text = _clean(" ".join(node.itertext()), MAX_BLOCK_CHARS)
        if len(text) < 2:
            return

        # The page title is shown above the article already.
        if kind == "heading" and " ".join(text.casefold().split()) == folded_title:
            return

        block = {"type": kind, "text": text}
        if level:
            block["level"] = level

        blocks.append(block)

    def add_image(node):
        url = _absolute_image_url(node.get("src") or "", page_url)
        if not url or url in seen_images:
            return

        seen_images.add(url)
        blocks.append({
            "type": "image",
            "url": url,
            "alt": _clean(node.get("alt") or "", 220),
        })

    def walk(parent):
        for node in parent:
            if len(blocks) >= MAX_BLOCKS:
                return

            if not isinstance(node.tag, str):
                continue

            tag = etree.QName(node).localname

            if tag == "graphic":
                add_image(node)

            elif tag == "head":
                level = (node.get("rend") or "h3").lstrip("h")
                if level not in {"2", "3", "4"}:
                    level = "3"
                add_text("heading", node, level)

            elif tag == "quote":
                add_text("quote", node)

            elif tag in {"p", "item"}:
                for graphic in node.iter("graphic"):
                    add_image(graphic)

                kind = "list" if tag == "item" else "text"
                add_text(kind, node)

            elif tag in {"main", "body", "div", "list", "figure"}:
                walk(node)

    walk(tree)
    return blocks


#/////////////////////////////////////////////////////////
# LEAD IMAGE /////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _same_image(first_url, second_url):
    """
    Whether two URLs are the same photo served through different image routes.

    The page's social image and the article's opening photo are usually one
    picture behind two paths (a resized one and the original) that still carry
    the same asset id.
    """
    if not first_url or not second_url:
        return False

    def without_query(url):
        return urlparse(url)._replace(scheme="", query="", fragment="").geturl()

    if without_query(first_url) == without_query(second_url):
        return True

    first_ids = ASSET_ID.findall(urlparse(first_url).path)
    second_ids = ASSET_ID.findall(urlparse(second_url).path)

    # Containment rather than equality: one route often prefixes the id.
    for first_id in first_ids:
        for second_id in second_ids:
            if first_id in second_id or second_id in first_id:
                return True

    return False


def _drop_duplicate_lead_image(metadata, blocks):
    """Keep the photo inside the article when it is also the lead image."""
    lead_image = metadata.get("lead_image", "")

    first_image = None
    for block in blocks:
        if block["type"] == "image":
            first_image = block
            break

    if first_image and _same_image(first_image["url"], lead_image):
        metadata["lead_image"] = ""


#/////////////////////////////////////////////////////////
# FULL EXTRACTION ////////////////////////////////////////
#/////////////////////////////////////////////////////////
def extract_article(html, page_url):
    """
    Read one downloaded page.

    Returns the metadata fields plus "url", "blocks", "words" (the length of the
    article text) and "blocked" (how many advertising blocks were removed).
    """
    metadata = _metadata(html, page_url)

    xml = _article_xml(html)
    blocks = _blocks_from_xml(xml, page_url, metadata.get("title", ""))

    # Ads go before anything is measured, so the word count is the article's
    # and the reader's browser never loads anything from an ad host.
    blocks, removed_count = remove_ads(blocks)

    if is_ad_url(metadata.get("lead_image", "")):
        metadata["lead_image"] = ""

    _drop_duplicate_lead_image(metadata, blocks)

    words = 0
    for block in blocks:
        if block["type"] in {"text", "quote", "list"}:
            words += len(block["text"].split())

    # A page with no readable body still has its description to show.
    if not words and metadata.get("summary"):
        summary_block = {"type": "text", "text": metadata["summary"]}
        blocks = [summary_block] + blocks
        words = len(metadata["summary"].split())

    return {
        **metadata,
        "url": page_url,
        "blocks": blocks[:MAX_BLOCKS],
        "words": words,
        "blocked": removed_count,
    }
