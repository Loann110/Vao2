from pathlib import Path

from huggingface_hub import hf_hub_download


ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
REPOSITORY = "Qwen/Qwen2.5-3B-Instruct-GGUF"
FILENAME = "qwen2.5-3b-instruct-q4_k_m.gguf"


def main():
    MODEL_DIR.mkdir(exist_ok=True)
    path = hf_hub_download(
        repo_id=REPOSITORY,
        filename=FILENAME,
        local_dir=MODEL_DIR,
    )
    print(f"Model ready: {path}")


if __name__ == "__main__":
    main()
