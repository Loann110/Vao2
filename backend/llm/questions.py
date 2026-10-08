"""
Answer a reader's question about one article or video, in the AI panel.

Called by `backend/routes/assistant.py` ("Ask AI" tab). The answer may only use
the source itself: the passages that best match the question are chosen
(`relevant_passages()`) and given to the local model with the question.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
from backend.llm.model import RUNTIME, generate_stream
from backend.llm.text import important_words


SYSTEM_PROMPT = (
    "You answer questions about one provided article or video transcript. Use only the "
    "provided excerpts. If the answer is not present, say so clearly. Answer in the same "
    "language as the question and do not invent facts."
)

PASSAGE_LENGTH = 700
PASSAGE_OVERLAP = 120

# How far past a passage's end to look for a sentence end to stop at.
SENTENCE_END_SEARCH = 160


#/////////////////////////////////////////////////////////
# PASSAGE SELECTION //////////////////////////////////////
#/////////////////////////////////////////////////////////
def _context_budget():
    """How many characters of source fit in the model's context, roughly."""
    # About three characters per token, after the answer and the instructions.
    available_characters = (RUNTIME["context"] - RUNTIME["max_tokens"] - 180) * 3
    return max(1200, min(3600, available_characters))


def _passages(text):
    """Overlapping passages of the text, ending on a sentence when possible."""
    passages = []
    step = max(350, PASSAGE_LENGTH - PASSAGE_OVERLAP)

    for index, start in enumerate(range(0, len(text), step)):
        end = min(len(text), start + PASSAGE_LENGTH)

        if end < len(text):
            search_limit = min(len(text), end + SENTENCE_END_SEARCH)
            sentence_end = text.find(". ", end, search_limit)

            if sentence_end != -1:
                end = sentence_end + 1
                start = max(0, end - PASSAGE_LENGTH)
            elif len(text) - end <= SENTENCE_END_SEARCH:
                end = len(text)
                start = max(0, end - PASSAGE_LENGTH)

        passage = text[start:end]
        if passage:
            passages.append((index, passage))

    return passages


def relevant_passages(question, text):
    """The passages that share the most words with the question, in text order."""
    clean_text = " ".join((text or "").split())
    if not clean_text:
        return ""

    budget = _context_budget()
    if len(clean_text) <= budget:
        return clean_text

    question_words = set(important_words(question))

    scored_passages = []
    for index, passage in _passages(clean_text):
        matches = 0
        for word in important_words(passage):
            if word in question_words:
                matches += 1

        # The opening passage wins ties: it usually introduces the subject.
        score = matches * 10 + (1 if index == 0 else 0)
        scored_passages.append((score, index, passage))

    best_first = sorted(scored_passages, key=lambda item: (-item[0], item[1]))

    selected = []
    used = 0
    for _, index, passage in best_first:
        if used + len(passage) > budget:
            continue

        selected.append((index, passage))
        used += len(passage)

    in_text_order = sorted(selected)
    return "\n\n".join(passage for _, passage in in_text_order)


#/////////////////////////////////////////////////////////
# ANSWER /////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def answer_stream(title, question, text, content_source=""):
    """Yield the answer piece by piece."""
    passages = relevant_passages(question, text)
    if not passages:
        yield "The source content is unavailable, so I cannot answer this question."
        return

    source_label = "video transcript" if content_source == "transcript" else "article"

    prompt = (
        f"Source type: {source_label}\n"
        f"Title: {title}\n\n"
        f"Relevant source excerpts:\n{passages}\n\n"
        f"Question: {question}\n\n"
        "Give a concise, direct answer grounded only in the excerpts."
    )

    model_answered = False
    for piece in generate_stream(prompt, system_prompt=SYSTEM_PROMPT):
        model_answered = True
        yield piece

    if not model_answered:
        yield "The local AI is unavailable, so I cannot answer this question."
