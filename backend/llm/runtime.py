"""Hardware-aware llama.cpp defaults.

Environment variables remain authoritative so packaged builds and advanced users can
override every automatically selected value.
"""

from dataclasses import asdict, dataclass
import os
import platform
import sys


@dataclass(frozen=True)
class RuntimeConfig:
    profile: str
    logical_cpus: int
    memory_gib: float | None
    context: int
    batch: int
    threads: int
    gpu_layers: int
    max_tokens: int

    def public_dict(self):
        return asdict(self)


def _total_memory_bytes():
    """Return physical memory using only the standard library."""
    try:
        if sys.platform == "win32":
            import ctypes

            class MemoryStatus(ctypes.Structure):
                _fields_ = [
                    ("length", ctypes.c_ulong),
                    ("memory_load", ctypes.c_ulong),
                    ("total_physical", ctypes.c_ulonglong),
                    ("available_physical", ctypes.c_ulonglong),
                    ("total_page_file", ctypes.c_ulonglong),
                    ("available_page_file", ctypes.c_ulonglong),
                    ("total_virtual", ctypes.c_ulonglong),
                    ("available_virtual", ctypes.c_ulonglong),
                    ("available_extended_virtual", ctypes.c_ulonglong),
                ]

            status = MemoryStatus()
            status.length = ctypes.sizeof(status)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                return status.total_physical
        elif sys.platform == "darwin":
            import subprocess

            result = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True,
                check=True,
                text=True,
                timeout=2,
            )
            return int(result.stdout.strip())
        elif hasattr(os, "sysconf"):
            return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    except (AttributeError, OSError, ValueError):
        pass
    return None


def _env_int(name, automatic):
    value = os.environ.get(name)
    if value is None or not value.strip():
        return automatic
    try:
        return int(value)
    except ValueError:
        return automatic


def select_runtime_config(
    logical_cpus=None,
    memory_bytes=None,
    machine=None,
    gpu_offload=False,
):
    """Choose conservative defaults across desktop and mobile-class hardware."""
    cpus = max(1, logical_cpus or os.cpu_count() or 1)
    total_memory = _total_memory_bytes() if memory_bytes is None else memory_bytes
    memory_gib = total_memory / (1024**3) if total_memory else None
    architecture = (machine or platform.machine()).lower()
    arm_device = "arm" in architecture or "aarch" in architecture

    if cpus <= 4 or (memory_gib is not None and memory_gib < 6):
        profile = "compact"
        context, batch, max_tokens = 1024, 64, 80
    elif cpus <= 8 or (memory_gib is not None and memory_gib < 12):
        profile = "balanced"
        context, batch, max_tokens = 1536, 128, 100
    else:
        profile = "performance"
        context, batch, max_tokens = 1536, 256, 120

    # x86 logical CPU counts usually include SMT; using every logical core can slow
    # token generation. ARM devices more commonly expose heterogeneous real cores.
    useful_cpus = cpus - 1 if arm_device else (cpus + 1) // 2
    thread_cap = 4 if profile == "compact" else 6 if profile == "balanced" else 8
    threads = max(1, min(useful_cpus, thread_cap))
    automatic_gpu_layers = -1 if gpu_offload else 0

    return RuntimeConfig(
        profile=profile,
        logical_cpus=cpus,
        memory_gib=round(memory_gib, 1) if memory_gib is not None else None,
        context=max(512, _env_int("VAO2_MODEL_CONTEXT", context)),
        batch=max(32, _env_int("VAO2_MODEL_BATCH", batch)),
        threads=max(1, _env_int("VAO2_MODEL_THREADS", threads)),
        gpu_layers=_env_int("VAO2_MODEL_GPU_LAYERS", automatic_gpu_layers),
        max_tokens=max(32, _env_int("VAO2_MODEL_MAX_TOKENS", max_tokens)),
    )
