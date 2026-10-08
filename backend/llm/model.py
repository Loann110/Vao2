"""
The local language model (a GGUF file run by llama.cpp).

Everything that talks to the model goes through `generate_stream()` here:
summaries (summary.py), questions (questions.py) and the weather assistant
(weather.py). The model is loaded once, on first use, and stays in memory.

The model is optional. When llama-cpp-python or the model file is missing,
`generate_stream()` yields nothing and each caller falls back to a non-AI
answer, so the rest of Vao2 keeps working.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import os
from pathlib import Path
from threading import Lock

from backend.llm.runtime import select_runtime_config

try:
    import llama_cpp
except ImportError:
    llama_cpp = None


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL = ROOT / "models" / "qwen2.5-1.5b-instruct-q4_k_m.gguf"
MODEL_PATH = Path(os.environ.get("VAO2_MODEL_PATH", DEFAULT_MODEL)).expanduser()

# Bump when prompts change, so summaries stored with the old ones are redone.
PIPELINE_VERSION = "qwen-1.5b-v4"

DEFAULT_SYSTEM_PROMPT = (
    "You are a news summarization assistant. Respond only in English, "
    "use only the provided information, and do not invent any facts."
)


def _gpu_offload_available():
    if llama_cpp is None:
        return False

    supports_gpu = getattr(llama_cpp, "llama_supports_gpu_offload", None)
    return bool(supports_gpu and supports_gpu())


RUNTIME = select_runtime_config(gpu_offload=_gpu_offload_available())

_model = None
_model_error = None
_load_lock = Lock()

# One llama.cpp context must not be decoded by two threads at once.
_generation_lock = Lock()


#/////////////////////////////////////////////////////////
# LOADING AND STATUS /////////////////////////////////////
#/////////////////////////////////////////////////////////
def _load_model():
    """The loaded model, or None with `_model_error` saying why."""
    global _model, _model_error

    if _model is not None:
        return _model

    if llama_cpp is None:
        _model_error = "llama-cpp-python is not installed"
        return None

    if not MODEL_PATH.is_file():
        _model_error = f"Model not found: {MODEL_PATH}"
        return None

    with _load_lock:
        # Another request may have loaded it while this one waited.
        if _model is not None:
            return _model

        try:
            _model = llama_cpp.Llama(
                model_path=str(MODEL_PATH),
                n_ctx=RUNTIME["context"],
                n_batch=min(RUNTIME["batch"], RUNTIME["context"]),
                n_threads=RUNTIME["threads"],
                n_threads_batch=RUNTIME["threads"],
                n_gpu_layers=RUNTIME["gpu_layers"],
                verbose=False,
            )
            _model_error = None
        except (OSError, RuntimeError, ValueError) as error:
            _model_error = str(error)
            return None

    return _model


def status():
    """Whether the model can run, shown in the sidebar badge."""
    runtime_installed = llama_cpp is not None
    model_installed = MODEL_PATH.is_file()

    return {
        "available": runtime_installed and model_installed,
        "model": MODEL_PATH.name,
        "backend": "llama.cpp",
        "runtime_installed": runtime_installed,
        "model_installed": model_installed,
        "loaded": _model is not None,
        "runtime": dict(RUNTIME),
        "error": _model_error,
    }


def model_cache_key():
    """
    Identifies the current model file and prompts.

    Stored next to each AI summary: when the model or the prompts change, the
    key changes and old summaries are generated again.
    """
    try:
        stat = MODEL_PATH.stat()
        model_revision = f"{stat.st_size}:{stat.st_mtime_ns}"
    except OSError:
        model_revision = "missing"

    return f"{MODEL_PATH.name}:{model_revision}:{PIPELINE_VERSION}"


#/////////////////////////////////////////////////////////
# GENERATION /////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def generate_stream(prompt, system_prompt=DEFAULT_SYSTEM_PROMPT):
    """Yield the answer piece by piece as llama.cpp produces it."""
    global _model_error

    model = _load_model()
    if model is None:
        return

    _model_error = None

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    try:
        with _generation_lock:
            response = model.create_chat_completion(
                messages=messages,
                temperature=0.2,
                max_tokens=RUNTIME["max_tokens"],
                repeat_penalty=1.15,
                stop=["<|im_end|>", "<|endoftext|>"],
                stream=True,
            )

            for chunk in response:
                text = chunk["choices"][0].get("delta", {}).get("content", "")
                if text:
                    yield text

    except (KeyError, OSError, RuntimeError, TypeError, ValueError) as error:
        _model_error = f"Generation failed: {error}"


def generate(prompt, system_prompt=DEFAULT_SYSTEM_PROMPT):
    """The complete answer at once, or None when the model produced nothing."""
    chunks = []
    for chunk in generate_stream(prompt, system_prompt):
        chunks.append(chunk)

    answer = "".join(chunks).strip()
    return answer or None
