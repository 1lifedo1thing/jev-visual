"""Download the pinned model into the location used by examples and benchmarks."""
import argparse
from pathlib import Path

from huggingface_hub import snapshot_download

from .adapters import MODEL_ID, MODEL_REVISION


def main():
    parser = argparse.ArgumentParser(description="Download the pinned Qwen3.5 visual model")
    parser.add_argument("--output", type=Path, default=Path(".models/Qwen3.5-0.8B-4bit"))
    args = parser.parse_args()
    path = snapshot_download(
        MODEL_ID, revision=MODEL_REVISION, local_dir=str(args.output),
        allow_patterns=["*.json", "*.jinja", "*.safetensors"],
    )
    print(f"Model ready: {path}")


if __name__ == "__main__":
    main()
