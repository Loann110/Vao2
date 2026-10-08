"""Hardware-aware llama.cpp defaults.

Called once by ``backend/llm/model.py`` when the module is imported. It returns
a plain dict of settings; it never loads the model itself.

    1. The machine is measured: processors and memory.
    2. A profile is chosen: "compact", "balanced" or "performance".
    3. Environment variables (``VAO2_MODEL_*``) override any default.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import os
import platform

import psutil


# Settings of each profile:
#   context      how much text the model reads at once (in tokens)
#   batch        how many tokens are processed per step when reading
#   max_tokens   the longest answer the model may write
#   max_threads  the most processor threads it may use
PROFILES = {
    "compact": {
        "context": 1024,
        "batch": 64,
        "max_tokens": 80,
        "max_threads": 4,
    },
    "balanced": {
        "context": 1536,
        "batch": 128,
        "max_tokens": 100,
        "max_threads": 6,
    },
    "performance": {
        "context": 1536,
        "batch": 256,
        "max_tokens": 120,
        "max_threads": 8,
    },
}


#/////////////////////////////////////////////////////////
# HARDWARE DETECTION /////////////////////////////////////
#/////////////////////////////////////////////////////////
def _memory_gib():
    total_bytes = psutil.virtual_memory().total
    return total_bytes / 1024**3


def _is_arm_processor():
    architecture = platform.machine().lower()
    return architecture.startswith(("arm", "aarch"))


#/////////////////////////////////////////////////////////
# ENVIRONMENT OVERRIDES //////////////////////////////////
#/////////////////////////////////////////////////////////
def _env_int(name, default):
    """The integer in environment variable `name`, or `default` if unset or invalid."""
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


#/////////////////////////////////////////////////////////
# PROFILE SELECTION //////////////////////////////////////
#/////////////////////////////////////////////////////////
def _choose_profile(cpus, memory_gib):
    if cpus <= 4 or memory_gib < 6:
        return "compact"

    if cpus <= 8 or memory_gib < 12:
        return "balanced"

    return "performance"


def _thread_count(cpus, max_threads):
    # x86 counts each core twice (hyper-threading) and using all of them slows
    # generation down; ARM reports real cores.
    if _is_arm_processor():
        useful_threads = cpus - 1
    else:
        useful_threads = (cpus + 1) // 2

    return max(1, min(useful_threads, max_threads))


def select_runtime_config(gpu_offload=False):
    """Choose conservative defaults for the machine running Vao2."""
    cpus = os.cpu_count() or 1
    memory_gib = _memory_gib()

    profile_name = _choose_profile(cpus, memory_gib)
    profile = PROFILES[profile_name]

    default_threads = _thread_count(cpus, profile["max_threads"])

    # -1 puts every layer of the model on the graphics card, 0 none.
    if gpu_offload:
        default_gpu_layers = -1
    else:
        default_gpu_layers = 0

    context = _env_int("VAO2_MODEL_CONTEXT", profile["context"])
    batch = _env_int("VAO2_MODEL_BATCH", profile["batch"])
    threads = _env_int("VAO2_MODEL_THREADS", default_threads)
    gpu_layers = _env_int("VAO2_MODEL_GPU_LAYERS", default_gpu_layers)
    max_tokens = _env_int("VAO2_MODEL_MAX_TOKENS", profile["max_tokens"])

    # Below these values the model cannot produce a usable summary.
    return {
        "profile": profile_name,
        "logical_cpus": cpus,
        "memory_gib": round(memory_gib, 1),
        "context": max(512, context),
        "batch": max(32, batch),
        "threads": max(1, threads),
        "gpu_layers": gpu_layers,
        "max_tokens": max(32, max_tokens),
    }
