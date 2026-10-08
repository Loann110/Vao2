"""
Article summary, and the questions suggested under it, in the AI panel.

Called by `backend/routes/assistant.py` when "Summarize" is clicked on a card.

Without the local model, the summary falls back to the most informative
sentences of the source, and the suggested questions to fixed templates.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import re

from backend.llm.model import generate, generate_stream
from backend.llm.text import important_words, key_sentences, transcript_opening


TRANSCRIPT_INSTRUCTION = (
    "Summarize this video transcript in two to four factual sentences and fewer "
    "than 80 words. State the video's main activity, what happens, and the result "
    "only when it is explicitly stated. Ignore speech fillers, sound cues, jokes, "
    "sponsors, and calls to action. Do not guess or invent facts."
)

ARTICLE_INSTRUCTION = (
    "Summarize this news item in two to four factual sentences and fewer "
    "than 80 words. Do not include information absent from the text."
)

QUESTIONS_INSTRUCTION = (
    "Write exactly three short, specific questions a reader could ask about this "
    "summary. One per line, no numbering, no explanations, each ending with '?'."
)

MAX_TITLE_IN_QUESTION = 64


#/////////////////////////////////////////////////////////
# SUMMARY ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def summary_stream(title, text, content_source=""):
    """
    Yield (text_piece, written_by_ai) while the summary is being written.

    `content_source` is "transcript" for a YouTube video, otherwise the text
    is an article.
    """
    text = (text or "").strip()

    if text:
        if content_source == "transcript":
            instruction = TRANSCRIPT_INSTRUCTION
            excerpt = transcript_opening(text)
        else:
            instruction = ARTICLE_INSTRUCTION
            excerpt = key_sentences(text, budget=1200)

        prompt = f"{instruction}\n\nTitle: {title}\n\nText: {excerpt}"

        model_answered = False
        for piece in generate_stream(prompt):
            model_answered = True
            yield piece, True

        if model_answered:
            return

    # No model, or nothing to summarize: the best sentences stand in.
    fallback = key_sentences(text or title, budget=360)
    yield fallback, False


#/////////////////////////////////////////////////////////
# SUGGESTED QUESTIONS ////////////////////////////////////
#/////////////////////////////////////////////////////////
def _short_title(title):
    clean_title = " ".join((title or "this content").split()).strip(" -–—:|")

    if len(clean_title) > MAX_TITLE_IN_QUESTION:
        clean_title = clean_title[:MAX_TITLE_IN_QUESTION].rsplit(" ", 1)[0] + "…"

    return clean_title


def _questions_from_answer(answer):
    """Up to three question lines from the model's answer."""
    questions = []

    for line in (answer or "").splitlines():
        # The model sometimes numbers or bullets its lines anyway.
        question = re.sub(r"^[\s\-*\d.\)]+", "", line).strip()

        if question.endswith("?"):
            questions.append(question)

    return questions[:3]


def _template_questions(title, summary, content_source):
    """Questions that fit any summary, used when the model is unavailable."""
    source_name = "video" if content_source == "transcript" else "article"

    questions = [
        f"What is the main point of the {source_name} about “{title}”?",
        f"Which facts or examples support the claims about “{title}”?",
    ]

    words = set(important_words(summary))

    if words & {"risk", "risks", "danger", "dangers", "limitation", "limitations"}:
        questions.append("What risks or limitations are mentioned?")

    elif words & {"compare", "compared", "comparison", "versus", "difference", "differences"}:
        questions.append("What differences or trade-offs are highlighted?")

    elif words & {"future", "next", "plan", "plans", "expected", "upcoming"}:
        questions.append("What does the source say will happen next?")

    elif content_source == "transcript":
        questions.append("What practical advice or recommendations does the video give?")

    else:
        questions.append(f"What consequences or next steps are described for “{title}”?")

    return questions


def suggest_questions(title, summary, content_source=""):
    """Three questions a reader could ask about this summary."""
    short_title = _short_title(title)
    summary = (summary or "").strip()

    if summary:
        source_label = "video transcript" if content_source == "transcript" else "article"

        prompt = (
            f"Source type: {source_label}\n"
            f"Title: {short_title}\n\n"
            f"Summary:\n{summary}\n\n"
            f"{QUESTIONS_INSTRUCTION}"
        )

        questions = _questions_from_answer(generate(prompt))
        if len(questions) == 3:
            return questions

    return _template_questions(short_title, summary, content_source)
