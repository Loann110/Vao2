import asyncio

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from backend import db
from backend.feeds.feeds import fetch_feed
from backend.llm.llm import status as llm_status
from backend.platforms.news import search_outlets
from backend.platforms.youtube import search_channels


router = APIRouter(prefix="/api")


class CategoryInput(BaseModel):
    id: str | None = None
    name: str


class SourceInput(BaseModel):
    id: str | None = None
    platform: str
    url: str
    feed_url: str | None = None
    title: str = ""
    subtitle: str = ""
    thumbnail: str = ""
    category_id: str = db.GENERAL_CATEGORY_ID


class CategoryUpdate(BaseModel):
    category_id: str


@router.get("/llm/status")
async def get_llm_status():
    return await run_in_threadpool(llm_status)


@router.get("/search")
async def search(platform: str, q: str = Query(min_length=2)):
    if platform == "news":
        return {"results": search_outlets(q)}

    if platform == "youtube":
        try:
            results = await run_in_threadpool(search_channels, q)
        except Exception as error:
            raise HTTPException(502, f"YouTube search failed: {error}") from error
        return {"results": results}

    if platform in {"rss", "podcast"} and q.startswith(("http://", "https://")):
        return {
            "results": [
                {
                    "platform": platform,
                    "title": q,
                    "description": "",
                    "url": q,
                    "feed_url": q,
                    "thumbnail": "",
                }
            ]
        }

    return {"results": []}


@router.get("/sources")
def get_sources():
    return {"categories": db.list_categories(), "sources": db.list_sources()}


@router.post("/categories", status_code=201)
def create_category(category: CategoryInput):
    if not category.name.strip():
        raise HTTPException(400, "Category name cannot be empty")
    return db.create_category(category.name, category.id)


@router.delete("/categories/{category_id}")
def delete_category(category_id: str):
    if not db.delete_category(category_id):
        raise HTTPException(404, "Category not found or cannot be deleted")
    return {"deleted": True}


@router.post("/sources", status_code=201)
@router.post("/sources/manual", status_code=201)
def create_source(source: SourceInput):
    return db.add_source(source.model_dump())


@router.patch("/sources/{source_id}")
def update_source(source_id: str, update: CategoryUpdate):
    source = db.update_source_category(source_id, update.category_id)
    if not source:
        raise HTTPException(404, "Source or category not found")
    return source


@router.delete("/sources/{source_id}")
def delete_source(source_id: str):
    if not db.delete_source(source_id):
        raise HTTPException(404, "Source not found")
    return {"deleted": True}


async def _refresh_source(source):
    if not source.get("feed_url"):
        return {"source_id": source["id"], "added": 0, "error": "Missing feed URL"}
    try:
        articles = await fetch_feed(source["feed_url"])
        added = await run_in_threadpool(db.save_articles, source["id"], articles)
        await run_in_threadpool(db.mark_source_fetched, source["id"])
        return {"source_id": source["id"], "added": added, "error": None}
    except (httpx.HTTPError, ValueError, OSError) as error:
        message = error.__class__.__name__
        await run_in_threadpool(db.mark_source_fetched, source["id"], message)
        return {"source_id": source["id"], "added": 0, "error": message}


@router.post("/refresh")
async def refresh_sources():
    sources = db.list_sources()
    results = await asyncio.gather(*(_refresh_source(source) for source in sources))
    return {
        "sources": len(results),
        "added": sum(result["added"] for result in results),
        "results": results,
    }


@router.get("/articles")
def get_articles(limit: int = Query(100, ge=1, le=500)):
    return {"articles": db.list_articles(limit)}
