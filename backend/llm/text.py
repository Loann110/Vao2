"""
Text helpers that shorten a source before it is given to the local model.

The model only reads a small context, so an article or a transcript must be cut
down first. These helpers choose what to keep. Used by summary.py and
questions.py; no model call happens here.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import re
from collections import Counter


STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "de", "des", "du",
    "en", "est", "et", "for", "from", "in", "is", "it", "la", "le", "les",
    "of", "on", "ou", "pour", "que", "qui", "sur", "that", "the", "to",
    "un", "une", "was", "were", "with",
}

# The first sentences of an article usually carry its main point.
OPENING_SENTENCES = 3
OPENING_BONUS = 1.4


#/////////////////////////////////////////////////////////
# WORDS //////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def important_words(text):
    """Lowercase words of the text, without numbers, short words and stop words."""
    words = re.findall(r"[^\W\d_]+", text.lower(), flags=re.UNICODE)

    kept = []
    for word in words:
        if len(word) > 2 and word not in STOP_WORDS:
            kept.append(word)

    return kept


#/////////////////////////////////////////////////////////
# SHORTENING /////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def key_sentences(text, budget=700):
    """
    The most informative sentences of the text, within `budget` characters.

    A sentence scores high when its words are frequent in the whole text. The
    chosen sentences are returned in their original order.
    """
    clean_text = " ".join((text or "").split())
    if len(clean_text) <= budget:
        return clean_text

    sentences = re.split(r"(?<=[.!?])\s+", clean_text)
    word_frequencies = Counter(important_words(clean_text))

    scored_sentences = []
    seen = set()

    for index, sentence in enumerate(sentences):
        normalized = sentence.casefold().strip()
        words = important_words(sentence)

        if normalized in seen or len(words) < 4:
            continue
        seen.add(normalized)

        score = sum(word_frequencies[word] for word in words) / len(words)
        if index < OPENING_SENTENCES:
            score *= OPENING_BONUS

        scored_sentences.append((score, index, sentence))

    selected = []
    used = 0

    for _, index, sentence in sorted(scored_sentences, reverse=True):
        extra = len(sentence) + (1 if selected else 0)
        if used + extra > budget:
            continue

        selected.append((index, sentence))
        used += extra

    if not selected:
        return clean_text[:budget].rsplit(" ", 1)[0]

    in_original_order = sorted(selected)
    return " ".join(sentence for _, sentence in in_original_order)


def transcript_opening(text, budget=2600):
    """
    The beginning of a video transcript, without caption noise.

    A transcript is kept in order rather than scored, because a video tells
    its story from the start. It is cut at the last sentence end when there is
    one near the budget.
    """
    # "[Music]", "[Applause]" and ">>" speaker marks carry no information.
    clean_text = re.sub(r"\[[^\]]{1,40}\]", " ", text or "")
    clean_text = re.sub(r">>+", " ", clean_text)
    clean_text = " ".join(clean_text.split())

    if len(clean_text) <= budget:
        return clean_text

    excerpt = clean_text[:budget]

    last_sentence_end = max(
        excerpt.rfind(". "),
        excerpt.rfind("! "),
        excerpt.rfind("? "),
    )

    if last_sentence_end >= int(budget * 0.75):
        return excerpt[:last_sentence_end + 1]

    return excerpt.rsplit(" ", 1)[0]
