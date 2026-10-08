"""
Every URL the browser calls, under /api.

One file per area of the interface. Each route stays short: it checks the
request, calls the logic in backend/platforms/ or backend/llm/, and returns the
result.

    articles.py    the feed, refresh, YouTube player reports
    assistant.py   AI panel: summary and questions
    reader.py      reader panel ("Read" on a card)
    sources.py     "Add source": search, sources, categories
    weather.py     Weather view and its assistant
    system.py      local model status
"""

from fastapi import APIRouter

from backend.routes import articles, assistant, reader, sources, system, weather


router = APIRouter(prefix="/api")

router.include_router(articles.router)
router.include_router(assistant.router)
router.include_router(reader.router)
router.include_router(sources.router)
router.include_router(weather.router)
router.include_router(system.router)
