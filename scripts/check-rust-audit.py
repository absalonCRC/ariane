"""Fail on advisories reachable in Ariane's declared macOS dependency graph."""
import json
from pathlib import Path
import subprocess
import sys


def applicable(report, packages):
    rows = list(report["vulnerabilities"]["list"])
    for values in report.get("warnings", {}).values():
        rows.extend(values)
    return [row for row in rows if (row["package"]["name"], row["package"]["version"]) in packages]


def main():
    report = json.loads(Path(sys.argv[1]).read_text())
    tree = subprocess.check_output(["cargo", "tree", "--locked", "--manifest-path", "src-tauri/Cargo.toml", "--target", "aarch64-apple-darwin", "--prefix", "none", "--format", "{p}", "-e", "normal,build,dev"], text=True)
    packages = {(parts[0], parts[1].removeprefix("v")) for line in tree.splitlines() if len(parts := line.split()) >= 2}
    if not packages:
        raise RuntimeError("Empty target dependency graph")
    failures = applicable(report, packages)
    for row in failures:
        print(row["advisory"]["id"], row["package"]["name"], row["package"]["version"])
    print(f'{len(failures)} applicable advisories; other-platform entries remain in the raw audit report.')
    return bool(failures)


if __name__ == "__main__":
    sys.exit(main())
