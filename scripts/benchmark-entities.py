#!/usr/bin/env python3
"""Recorded GLiNER forwards, followed by the actual Rust publication gates.

Use the installed memory/runtime/bin/python. Calibration and validation must be
separate invocations; --postprocess never reruns an inference.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import resource
import statistics
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def percentile(values, fraction):
    values = sorted(values)
    return values[min(len(values)-1, int((len(values)-1)*fraction + 0.999999))]


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, choices=[1, 2, 4], default=2)
    parser.add_argument("--batch", type=int, choices=[1, 2, 4], default=1)
    parser.add_argument("--split", choices=["calibration", "validation"], default="calibration")
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument("--postprocess", action="store_true")
    parser.add_argument("--calibration", type=Path, help="Frozen calibration report, required for validation")
    parser.add_argument("--reference-policy", type=Path, default=ROOT/"benchmarks/fixtures/ai/policy-baseline.json")
    args = parser.parse_args()
    if not 1 <= args.repeat <= 5:
        parser.error("--repeat must be between 1 and 5")
    if args.split == "validation" and not args.calibration and not args.postprocess:
        parser.error("Validation requires --calibration and an already frozen bundled policy")
    if not args.postprocess:
        if args.output.exists():
            parser.error("Use a new output path; recorded inference is never overwritten")
        os.environ["ARIANE_NER_THREADS"] = str(args.threads)
        os.environ["ARIANE_NER_BATCH"] = str(args.batch)
        source = ROOT / "src-tauri/resources/engine/memory.py"
        policy = source.with_name("ai-policy.json")
        spec = importlib.util.spec_from_file_location("ariane_worker", source)
        worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(worker)
        installed = Path.home() / "Library/Application Support/fr.ariane.writer/memory"
        engine = worker.MemoryEngine(installed)
        paths = {name: ROOT / f"benchmarks/fixtures/ai/{name}.json" for name in ["entities-v2", "classification"]}
        corpora = {name: json.loads(path.read_text()) for name, path in paths.items()}
        calibration = json.loads(args.calibration.read_text()) if args.calibration else None
        if calibration:
            if calibration["selectedPolicy"] != json.loads(policy.read_text()):
                parser.error("Bundled policy differs from frozen calibration selection")
            if any(calibration["corpora"][name]["sha256"] != digest(path) for name, path in paths.items()):
                parser.error("Corpus changed after calibration")
        rows, notes = [], []
        start = time.perf_counter()
        engine.gliner()
        load = (time.perf_counter()-start)*1000
        for name, target in [("entities-v2", rows), ("classification", notes)]:
            for case in [c for c in corpora[name]["cases"] if c["split"] == args.split]:
                request = {"operation": "entities", "text": case["text"], "types": case.get("types", [])} if name == "entities-v2" else {
                    "operation": "classify_note", "title": case["title"], "text": case["text"], "types": case["types"]}
                timings = []
                for _ in range(args.repeat):
                    start = time.perf_counter()
                    output = engine.run(request)
                    timings.append((time.perf_counter()-start)*1000)
                target.append({"case": case, "output": output, "timingsMs": timings, "elapsedMs": statistics.median(timings)})
                print(json.dumps({"case": case["id"], "medianMs": round(statistics.median(timings), 1)}), flush=True)
        source_paths = [source, policy, ROOT/"src-tauri/src/memory/mod.rs", ROOT/"src-tauri/src/memory/ner.rs", ROOT/"src-tauri/src/vaults/classification.rs", ROOT/"src-tauri/src/ai_policy.rs", Path(__file__)]
        elapsed = [t for row in rows for t in row["timingsMs"]]
        report = {"threads": args.threads, "batch": args.batch, "split": args.split, "repeat": args.repeat,
            "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "hardware": platform.platform(), "machine": subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip(),
            "startedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "model": worker.NER_MODEL_ID,
            "policy": json.loads(policy.read_text()), "corpora": {name: {"sha256": digest(paths[name]), "protocol": corpus["protocol"]} for name, corpus in corpora.items()},
            "sourceSha256": {str(p.relative_to(ROOT)): digest(p) for p in source_paths},
            "installedManifestSha256": digest(installed/"manifest.json"), "quantizedReceipt": json.loads((installed/"quantized/gliner.json").read_text()),
            "loadMs": load, "medianMs": statistics.median(elapsed), "p95Ms": percentile(elapsed, .95),
            "maxRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "note": "Process startup uses the OS file cache. Timings include first requests; per-request samples remain separate. No energy measurement.",
            "rows": rows, "classification": notes}
        if calibration:
            report["referencePolicy"] = calibration.get("referencePolicy", calibration["policy"])
            report["calibrationReportSha256"] = digest(args.calibration)
        else:
            report["referencePolicy"] = json.loads(args.reference_policy.read_text())
            report["referencePolicySha256"] = digest(args.reference_policy)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    subprocess.run(["cargo", "test", "--locked", "--manifest-path", "src-tauri/Cargo.toml", "ai_benchmark::entity_policy_evaluation", "--", "--ignored", "--exact"],
        cwd=ROOT, env=os.environ | {"ARIANE_NER_REPORT": str(args.output.resolve())}, check=True)
    report = json.loads(args.output.read_text())
    print(json.dumps({"split": report["split"], "entities": report["metrics"], "classification": report["classificationMetrics"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
