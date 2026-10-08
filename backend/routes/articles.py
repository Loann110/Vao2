"""
The article feed.

    GET  /api/articles                       the "For you" feed
    GET  /api/articles/{id}                  one article (opened in the AI panel)
    POST /api/refresh                        download every source's feed again
    POST /api/articles/{id}/embeddable       the YouTube player refused a video
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import asyncio

import httpx
from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from backend import db
from backend.platforms.feeds import fetch_feed
from backend.platforms.youtube import embeddable_statuses, youtube_api_key


router = APIRouter()


#/////////////////////////////////////////////////////////
# READING THE FEED ///////////////////////////////////////
#/////////////////////////////////////////////////////////
@router.get("/articles")
def list_articles(limit: int = Query(100, ge=1, le=500)):
    return {"articles": db.list_articles(limit)}


@router.get("/articles/{article_id}")
def get_article(article_id: int):
    article = db.get_article(article_id)
    if not article:
        raise HTTPException(404, "Article not found")

    # Names the AI panel reads.
    article["source_name"] = article["source_title"]
    article["category"] = article["category_id"]

    return {"article": article}


#/////////////////////////////////////////////////////////
# REFRESH ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
async def _refresh_source(source):
    """Download one source's feed and store its articles. Never raises."""
    source_id = source["id"]

    if not source.get("feed_url"):
        return {"source_id": source_id, "added": 0, "error": "Missing feed URL"}

    try:
        articles = await fetch_feed(source["feed_url"])
        added = await run_in_threadpool(db.save_articles, source_id, articles)
        await run_in_threadpool(db.mark_source_fetched, source_id)

        return {"source_id": source_id, "added": added, "error": None}

    except (httpx.HTTPError, ValueError, OSError) as error:
        error_name = error.__class__.__name__
        await run_in_threadpool(db.mark_source_fetched, source_id, error_name)

        return {"source_id": source_id, "added": 0, "error": error_name}


async def _flag_videos_youtube_refuses():
    """
    Mark new videos whose owner refuses the embedded player.

    Only with a YouTube Data API key. Without one, the player in the browser
    reports each refusal itself (see `mark_embeddable` below).
    """
    api_key = youtube_api_key()
    if not api_key:
        return

    articles = await run_in_threadpool(db.unchecked_youtube_articles)

    # media_url is ".../embed/<video id>"
    article_id_by_video = {}
    for article in articles:
        video_id = article["media_url"].rstrip("/").rsplit("/", 1)[-1]
        article_id_by_video[video_id] = article["id"]

    statuses = await embeddable_statuses(list(article_id_by_video), api_key)

    status_by_article = {}
    for video_id, embeddable in statuses.items():
        status_by_article[article_id_by_video[video_id]] = embeddable

    await run_in_threadpool(db.save_embeddable_statuses, status_by_article)


@router.post("/refresh")
async def refresh_sources():
    sources = db.list_sources()

    # All sources at once; one failing source never stops the others.
    results = await asyncio.gather(*[_refresh_source(source) for source in sources])

    await _flag_videos_youtube_refuses()

    added_total = sum(result["added"] for result in results)

    return {
        "sources": len(results),
        "added": added_total,
        "results": results,
    }


#/////////////////////////////////////////////////////////
# YOUTUBE PLAYER REPORT //////////////////////////////////
#/////////////////////////////////////////////////////////
@router.post("/articles/{article_id}/embeddable")
def mark_embeddable(article_id: int, embeddable: bool = Body(embed=True)):
    """Record what the embedded player answered, so the card is drawn right next time."""
    if not db.set_article_embeddable(article_id, embeddable):
        raise HTTPException(404, "YouTube article not found")

    return {"id": article_id, "embeddable": embeddable}
