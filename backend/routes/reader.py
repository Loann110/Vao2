"""
The reader panel that opens when "Read" is clicked on a card.

    GET /api/preview?url=...      the article, extracted from its page
"""

from fastapi import APIRouter
from pydantic import AnyHttpUrl

from backend.platforms.reader.preview import read_source


router = APIRouter()


@router.get("/preview")
async def preview_article(url: AnyHttpUrl):
    return await read_source(str(url))
