"""
The AI panel: summary of an article, and questions about it.

    POST /api/articles/{id}/summary/stream     "Summarize" on a card
    POST /api/articles/{id}/ask/stream         "Ask AI" tab of the panel

Both answers are streamed (see streaming.py). The article's full text is
fetched the first time it is needed and stored, and an AI summary is stored
with the model that wrote it, so reopening an article is instant.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
from fastapi import APIRouter, Body, HTTPException
from fastapi.concurrency import iterate_in_threadpool, run_in_threadpool

from backend import db
from backend.llm.context import article_context
from backend.llm.model import model_cache_key
from backend.llm.questions import answer_stream
from backend.llm.summary import suggest_questions, summary_stream
from backend.routes.streaming import event_line, stream_response


router = APIRouter()


#/////////////////////////////////////////////////////////
# SHARED STEPS ///////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _article_or_404(article_id):
    article = db.get_article(article_id)
    if not article:
        raise HTTPException(404, "Article not found")

    return article


async def _article_content(article):
    """(content, content_source) of the article, fetched and stored on first use."""
    content = article.get("content", "")
    content_source = article.get("content_source", "")

    if content:
        return content, content_source

    content, content_source = await article_context(article)

    await run_in_threadpool(
        db.save_article_content,
        article["id"],
        content,
        content_source,
    )

    return content, content_source


def _summary_details(article, summary, written_by_ai, content_source, cached=False):
    """Everything the panel shows under the summary."""
    return {
        "synthesis": summary,
        "generated_by_ai": written_by_ai,
        "content_source": content_source,
        "cached": cached,
        "suggested_questions": suggest_questions(article["title"], summary, content_source),
        "sources_used": [
            {
                "source": article["source_title"],
                "title": article["title"],
                "url": article["url"],
            },
        ],
    }


#/////////////////////////////////////////////////////////
# SUMMARY ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
@router.post("/articles/{article_id}/summary/stream")
async def stream_article_summary(article_id: int):
    article = _article_or_404(article_id)

    async def events():
        cache_key = model_cache_key()

        stored_summary = article.get("ai_summary", "")
        stored_by_this_model = article.get("ai_summary_model") == cache_key

        if stored_summary and stored_by_this_model:
            details = _summary_details(
                article,
                stored_summary,
                True,
                article.get("content_source", ""),
                cached=True,
            )
            yield event_line("complete", details=details)
            return

        yield event_line("status", message="Preparing article…")
        content, content_source = await _article_content(article)

        yield event_line("status", message="Loading local AI…")

        pieces = []
        written_by_ai = False

        writer = summary_stream(article["title"], content, content_source)
        async for piece, piece_by_ai in iterate_in_threadpool(writer):
            pieces.append(piece)
            written_by_ai = written_by_ai or piece_by_ai
            yield event_line("delta", text=piece, generated_by_ai=piece_by_ai)

        summary = "".join(pieces).strip()

        if written_by_ai:
            await run_in_threadpool(
                db.save_article_ai_summary,
                article_id,
                summary,
                cache_key,
            )

        details = _summary_details(article, summary, written_by_ai, content_source)
        yield event_line("complete", details=details)

    return stream_response(events())


#/////////////////////////////////////////////////////////
# QUESTIONS //////////////////////////////////////////////
#/////////////////////////////////////////////////////////
@router.post("/articles/{article_id}/ask/stream")
async def stream_article_answer(
    article_id: int,
    question: str = Body(embed=True, min_length=2, max_length=500),
):
    article = _article_or_404(article_id)

    question = question.strip()
    if len(question) < 2:
        raise HTTPException(422, "Question is too short")

    async def events():
        if not article.get("content"):
            yield event_line("status", message="Preparing source content…")

        content, content_source = await _article_content(article)

        yield event_line("status", message="Thinking…")

        writer = answer_stream(article["title"], question, content, content_source)
        async for piece in iterate_in_threadpool(writer):
            yield event_line("delta", text=piece)

        yield event_line("complete")

    return stream_response(events())
