"""
The state of the local AI model, shown in the sidebar badge.

    GET /api/llm/status
"""

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from backend.llm.model import status as model_status


router = APIRouter()


@router.get("/llm/status")
async def get_model_status():
    return await run_in_threadpool(model_status)
