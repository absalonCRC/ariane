#!/usr/bin/env python3
"""Measure fresh and reopened synthetic sessions in the opt-in macOS bundle."""
import argparse
import json
import os
from pathlib import Path
import platform
import plistlib
import signal
import subprocess
import time


def processes():
    rows = subprocess.check_output(
        ["ps", "-axo", "pid=,ppid=,rss=,time=,comm="], text=True
    )
    result = {}
    for line in rows.splitlines():
        pid, parent, rss, cpu, command = line.strip().split(None, 4)
        seconds = 0.0
        for part in cpu.split(":"):
            seconds = seconds * 60 + float(part)
        result[int(pid)] = dict(
            pid=int(pid), parent=int(parent), rssKiB=int(rss), cpuSeconds=seconds,
            command=command,
        )
    return result


def run(executable, directory, phase):
    report_path = directory / "report.json"
    initial = processes()
    samples = []
    started = time.monotonic()
    epoch = time.time_ns() / 1e6
    log = directory / (phase + ".log")
    with log.open("wb") as output:
        app = subprocess.Popen(
            [str(executable)],
            env={**os.environ, "ARIANE_PERF_DIR": str(directory)},
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            while app.poll() is None:
                current = processes()
                owned = {app.pid}
                while True:
                    descendants = {pid for pid, row in current.items() if row["parent"] in owned}
                    if descendants <= owned:
                        break
                    owned |= descendants
                pressure = subprocess.check_output(
                    ["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True
                )
                samples.append({
                    "elapsedSeconds": round(time.monotonic() - started, 3),
                    "owned": [row for pid, row in current.items() if pid in owned],
                    "newWebContentCandidates": [
                        row for pid, row in current.items()
                        if pid not in initial and "WebKit.WebContent" in row["command"]
                    ],
                    "memoryPressure": int(pressure),
                })
                if time.monotonic() - started > 150:
                    raise TimeoutError(f"{phase} timed out. See {log}")
                try:
                    app.wait(timeout=0.4)
                except subprocess.TimeoutExpired:
                    pass
        finally:
            if app.poll() is None:
                os.killpg(app.pid, signal.SIGTERM)
                try:
                    app.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(app.pid, signal.SIGKILL)
                    app.wait()
            (directory / (phase + "-processes.json")).write_text(json.dumps(samples, indent=2))

    if app.returncode or not report_path.is_file():
        raise RuntimeError(f"{phase} exit {app.returncode} without usable report. See {log}")
    report = json.loads(report_path.read_text())
    report["launchEpochMs"] = epoch
    ready = "homeReadyMs" if phase == "fresh" else "editorReadyMs"
    if ready in report:
        report["launchToReadyMs"] = report["navigationTimeOrigin"] + report[ready] - epoch
    destination = directory / (phase + ".json")
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    report_path.unlink()
    print(destination, report["status"], flush=True)
    if report["status"] != "pass":
        raise RuntimeError(f"{report.get('phase')}: {report.get('error')}")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument("--size", choices=("short", "long", "stress"), action="append")
    args = parser.parse_args()
    if args.repeat < 1:
        parser.error("--repeat must be positive")
    contents = args.app.resolve() / "Contents"
    executable = contents / "MacOS/ariane"
    plist = contents / "Info.plist"
    if not executable.is_file() or not plist.is_file():
        parser.error("A macOS ariane.app benchmark bundle is required")
    if plistlib.loads(plist.read_bytes()).get("CFBundleIdentifier") != "fr.ariane.writer.performance-reference":
        parser.error("Use the isolated fr.ariane.writer.performance-reference bundle")
    directory = args.directory.resolve()
    directory.mkdir(parents=True, exist_ok=False)
    (directory / "host.json").write_text(json.dumps({
        "machine": platform.machine(), "macOS": platform.mac_ver()[0],
        "hardware": subprocess.check_output(["sysctl", "-n", "hw.model"], text=True).strip(),
        "logicalProcessors": os.cpu_count(),
        "physicalMemoryBytes": int(subprocess.check_output(["sysctl", "-n", "hw.memsize"])),
    }, indent=2))
    for trial in range(1, args.repeat + 1):
        for size in args.size or ("short", "long"):
            run_directory = directory / f"{size}-{trial}"
            run_directory.mkdir()
            (run_directory / ".ariane-performance").touch()
            if size == "short":
                (run_directory / ".memory-benchmark").touch()
            elif size == "stress":
                (run_directory / ".large-manuscript").touch()
            fresh = run(executable, run_directory, "fresh")
            reopened = run(executable, run_directory, "reopened")
            if reopened["scene"] != "scene-0" or reopened["cursor"] != fresh["cursor"]:
                raise RuntimeError(f"Session context changed in {run_directory}")


if __name__ == "__main__":
    main()
