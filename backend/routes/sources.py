"""
The "Add source" view: search, the source library and its categories.

    GET    /api/search?platform=news|youtube&q=...
    GET    /api/sources                    sources and categories
    POST   /api/sources                    add a source
    PATCH  /api/sources/{id}               move a source to another category
    DELETE /api/sources/{id}
    POST   /api/categories
    DELETE /api/categories/{id}            its sources move to "General"
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import httpx
from fastapi import APIRouter, Body, HTTPException, Query

from backend import db
from backend.platforms.news import search_outlets
from backend.platforms.youtube import search_channels


router = APIRouter()

SUPPORTED_PLATFORMS = {"news", "youtube"}


#/////////////////////////////////////////////////////////
# SEARCH /////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
@router.get("/search")
async def search(platform: str, q: str = Query(min_length=2)):
    if platform == "news":
        return {"results": search_outlets(q)}

    if platform == "youtube":
        try:
            channels = await search_channels(q)
        except (httpx.HTTPError, RuntimeError, ValueError) as error:
            raise HTTPException(502, f"YouTube search failed: {error}") from error

        return {"results": channels}

    return {"results": []}


#/////////////////////////////////////////////////////////
# SOURCES ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
@router.get("/sources")
def list_sources():
    return {
        "categories": db.list_categories(),
        "sources": db.list_sources(),
    }


@router.post("/sources", status_code=201)
def create_source(
    platform: str = Body(),
    url: str = Body(),
    id: str | None = Body(None),
    feed_url: str | None = Body(None),
    title: str = Body(""),
    subtitle: str = Body(""),
    thumbnail: str = Body(""),
    category_id: str = Body(db.GENERAL_CATEGORY_ID),
):
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(400, "Unsupported source platform")

    source = {
        "id": id,
        "platform": platform,
        "url": url,
        "feed_url": feed_url,
        "title": title,
        "subtitle": subtitle,
        "thumbnail": thumbnail,
        "category_id": category_id,
    }
    return db.add_source(source)


@router.patch("/sources/{source_id}")
def change_source_category(source_id: str, category_id: str = Body(embed=True)):
    source = db.update_source_category(source_id, category_id)
    if not source:
        raise HTTPException(404, "Source or category not found")

    return source


@router.delete("/sources/{source_id}")
def delete_source(source_id: str):
    if not db.delete_source(source_id):
        raise HTTPException(404, "Source not found")

    return {"deleted": True}


#/////////////////////////////////////////////////////////
# CATEGORIES /////////////////////////////////////////////
#/////////////////////////////////////////////////////////
@router.post("/categories", status_code=201)
def create_category(name: str = Body(), id: str | None = Body(None)):
    if not name.strip():
        raise HTTPException(400, "Category name cannot be empty")

    return db.create_category(name, id)


@router.delete("/categories/{category_id}")
def delete_category(category_id: str):
    if not db.delete_category(category_id):
        raise HTTPException(404, "Category not found or cannot be deleted")

    return {"deleted": True}
