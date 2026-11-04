#!/usr/bin/env python3
"""Evaluate frozen search policies on real indexed passage vectors."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--split", choices=["calibration", "validation"], required=True)
    parser.add_argument("--calibration", type=Path)
    parser.add_argument("--fusion", action="store_true", help="Independent validation of the explicit RRF path")
    parser.add_argument("--postprocess", action="store_true", help="Attach provenance to an existing native.json without inference")
    args = parser.parse_args()
    if args.output.exists() and not args.postprocess:
        parser.error("Use a fresh output directory")
    if args.split == "validation" and not args.calibration and not args.fusion:
        parser.error("Validation requires a frozen calibration report")
    corpus = ROOT / ("benchmarks/fixtures/ai/retrieval-fusion.json" if args.fusion else "benchmarks/fixtures/ai/retrieval-v2.json")
    if args.calibration and not args.fusion:
        manifest = json.loads((args.calibration.parent / "manifest.json").read_text())
        if manifest["corpusSha256"] != digest(corpus):
            parser.error("Corpus changed since calibration")
    args.output.mkdir(parents=True, exist_ok=args.postprocess)
    tracked = [Path(__file__), corpus, ROOT/"src-tauri/src/ai_benchmark/retrieval_metrics.rs", ROOT/"src-tauri/src/inference/encoding.rs", ROOT/"src-tauri/src/retrieval/mod.rs", ROOT/"src-tauri/src/retrieval/ranking.rs", ROOT/"src-tauri/src/retrieval/fusion.rs", ROOT/"src-tauri/src/ai_benchmark/fusion_metrics.rs", ROOT/"src-tauri/src/vaults/parse.rs"]
    manifest = {"commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "hardware": platform.platform(), "corpusSha256": digest(corpus),
        "files": {str(p.relative_to(ROOT)): digest(p) for p in tracked},
        "weightsSha256": digest(ROOT/"src-tauri/resources/models/embeddinggemma-300M-Q8_0.gguf"),
        "runtimeSha256": digest(ROOT/"src-tauri/resources/engine/llama-server"),
        "note": "Synthetic scenes, real indexed chunks and Rust search/suggestion paths. OS disk cache is not purged; no energy measurement."}
    (args.output/"manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    output = args.output.resolve()/"native.json"
    if not args.postprocess:
        test = "ai_benchmark::retrieval_fusion_evaluation" if args.fusion else "ai_benchmark::retrieval_policy_evaluation"
        subprocess.run(["cargo", "test", "--locked", "--manifest-path", "src-tauri/Cargo.toml", test, "--", "--ignored", "--exact"],
            cwd=ROOT, env=os.environ | {"ARIANE_AI_REPORT": str(output), "ARIANE_AI_SPLIT": args.split}, check=True)
    report = json.loads(output.read_text())
    if args.calibration:
        frozen = json.loads(args.calibration.read_text())
        if not args.fusion and frozen["selectedPolicy"] != report["selectedPolicy"]:
            raise SystemExit("Bundled search policy differs from frozen calibration")
        report["calibrationReportSha256"] = digest(args.calibration)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    summary = {"fusion": report["metrics"], "qualityBudgetsPassed": report["qualityBudgetsPassed"]} if args.fusion else {
        "split": args.split, "evaluated": report["evaluations"][0]["metrics"], "selectedPolicy": report["selectedPolicy"]}
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
