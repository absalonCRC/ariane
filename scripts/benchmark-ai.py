#!/usr/bin/env python3
"""Evaluate production Rust paths on synthetic inputs, never on personal projects."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    output = args.output.resolve()
    corpus = ROOT / "benchmarks/fixtures/ai/retrieval.json"
    manifest = {"commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                "workingDiffSha256": hashlib.sha256(subprocess.check_output(["git","diff"],cwd=ROOT)).hexdigest(),
                "corpusSha256": digest(corpus), "scriptSha256": digest(Path(__file__)),
                "hardware": platform.platform(), "startedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "note": "Synthetic regression evaluation; process startup uses the OS file cache. No energy measurement.",
                "files": {str(p.relative_to(ROOT)): digest(p) for p in [ROOT / "src-tauri/resources/models/embeddinggemma-300M-Q8_0.gguf", ROOT / "src-tauri/resources/engine/llama-server", ROOT / "src-tauri/src/inference/mod.rs", ROOT / "src-tauri/src/retrieval/mod.rs", ROOT / "src-tauri/src/voice.rs"]}}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    subprocess.run(["cargo", "test", "--locked", "--manifest-path", "src-tauri/Cargo.toml", "ai_benchmark::native_ai_evaluation", "--", "--ignored", "--exact"],
                   cwd=ROOT, env=os.environ | {"ARIANE_AI_REPORT": str(output / "native.json")}, check=True)
    report = json.loads((output / "native.json").read_text())
    print(json.dumps({"output": str(output), "cleanupDecisions": [r["accepted"] for r in report["cleanup"]],
                      "ranks": [r["rank"] for r in report["retrieval"]]}, indent=2))


if __name__ == "__main__":
    main()
