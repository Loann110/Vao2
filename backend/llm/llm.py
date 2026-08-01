import os

import httpx


OLLAMA_URL = os.environ.get("VAO2_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("VAO2_OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT = float(os.environ.get("VAO2_OLLAMA_TIMEOUT", "60"))

SYSTEM_PROMPT = (
    "You are a news summarization assistant. Respond only in English, "
    "use only the provided information, and do not invent any facts."
)


def status():
    """Return whether Ollama is running and the configured model is installed."""
    try:
        response = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        response.raise_for_status()
        models = [model.get("name", "") for model in response.json().get("models", [])]
        model_base = OLLAMA_MODEL.split(":", 1)[0]
        available = any(
            name == OLLAMA_MODEL or name.split(":", 1)[0] == model_base
            for name in models
        )
        return {"available": available, "model": OLLAMA_MODEL, "ollama": True}
    except (httpx.HTTPError, ValueError):
        return {"available": False, "model": OLLAMA_MODEL, "ollama": False}


def generate(prompt, json_mode=False):
    """Generate text with Ollama, returning None when it is unavailable."""
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "system": SYSTEM_PROMPT,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.2},
        }
        if json_mode:
            payload["format"] = "json"

        response = httpx.post(
            f"{OLLAMA_URL}/api/generate",
            json=payload,
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()
        return response.json().get("response", "").strip() or None
    except (httpx.HTTPError, ValueError):
        return None


def short_summary(title, text):
    """Return a short English summary and whether Ollama generated it."""
    text = (text or "").strip()
    if text and status()["available"]:
        summary = generate(
            "Respond only in English. Summarize this news item in two to four "
            "factual sentences and fewer than 80 words. Do not include any "
            "information that is absent from the provided text.\n\n"
            f"Title: {title}\n\nText: {text[:10000]}"
        )
        if summary:
            return summary, True

    fallback = text or title
    words = fallback.split()
    return " ".join(words[:45]) + ("..." if len(words) > 45 else ""), False
