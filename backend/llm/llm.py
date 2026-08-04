import os
from pathlib import Path
from threading import Lock

try:
    from llama_cpp import Llama
except ImportError:  # Keep the feed usable until the optional local-AI runtime is installed.
    Llama = None


ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = Path(
    os.environ.get(
        "VAO2_MODEL_PATH",
        ROOT / "models" / "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    )
).expanduser()
MODEL_CONTEXT = int(os.environ.get("VAO2_MODEL_CONTEXT", "2048"))
MODEL_THREADS = int(
    os.environ.get("VAO2_MODEL_THREADS", str(max(1, (os.cpu_count() or 4) - 1)))
)
MODEL_GPU_LAYERS = int(os.environ.get("VAO2_MODEL_GPU_LAYERS", "0"))
MODEL_MAX_TOKENS = int(os.environ.get("VAO2_MODEL_MAX_TOKENS", "300"))

SYSTEM_PROMPT = (
    "You are a news summarization assistant. Respond only in English, "
    "use only the provided information, and do not invent any facts."
)

_model = None
_model_error = None
_model_lock = Lock()
_generation_lock = Lock()


def _load_model():
    """Load the GGUF model once in the FastAPI process."""
    global _model, _model_error

    if _model is not None:
        return _model
    if Llama is None:
        _model_error = "llama-cpp-python is not installed"
        return None
    if not MODEL_PATH.is_file():
        _model_error = f"Model not found: {MODEL_PATH}"
        return None

    with _model_lock:
        if _model is not None:
            return _model
        try:
            _model = Llama(
                model_path=str(MODEL_PATH),
                n_ctx=MODEL_CONTEXT,
                n_batch=min(256, MODEL_CONTEXT),
                n_threads=MODEL_THREADS,
                n_gpu_layers=MODEL_GPU_LAYERS,
                verbose=False,
            )
            _model_error = None
        except (OSError, RuntimeError, ValueError) as error:
            _model_error = str(error)
            return None

    return _model


def status():
    """Return the availability of the embedded llama.cpp runtime and GGUF model."""
    runtime_installed = Llama is not None
    model_installed = MODEL_PATH.is_file()
    return {
        "available": runtime_installed and model_installed,
        "model": MODEL_PATH.name,
        "backend": "llama.cpp",
        "runtime_installed": runtime_installed,
        "model_installed": model_installed,
        "loaded": _model is not None,
        "error": _model_error,
    }


def generate(prompt, json_mode=False):
    """Generate text in-process with llama.cpp, or return None when unavailable."""
    model = _load_model()
    if model is None:
        return None

    parameters = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": MODEL_MAX_TOKENS,
    }
    if json_mode:
        parameters["response_format"] = {"type": "json_object"}

    try:
        # A Llama context must not be decoded by multiple FastAPI worker threads at once.
        with _generation_lock:
            response = model.create_chat_completion(**parameters)
        content = response["choices"][0]["message"]["content"]
        return content.strip() or None
    except (KeyError, OSError, RuntimeError, TypeError, ValueError):
        return None


def short_summary(title, text):
    """Return a short English summary and whether llama.cpp generated it."""
    text = (text or "").strip()
    if text:
        summary = generate(
            "Summarize this news item in two to four factual sentences and "
            "fewer than 80 words. Do not include any information that is "
            "absent from the provided text.\n\n"
            f"Title: {title}\n\nText: {text[:6000]}"
        )
        if summary:
            return summary, True

    fallback = text or title
    words = fallback.split()
    return " ".join(words[:45]) + ("..." if len(words) > 45 else ""), False
