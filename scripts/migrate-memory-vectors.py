#!/usr/bin/env python3
"""Resume or reverse the format migration of derived manuscript vectors only.

Run with Ariane closed. Source text and model identifiers are never changed.
Legacy 384-dimensional spaces remain JSON; AM01 is the current 768-d format.
"""
import argparse
import json
import math
from pathlib import Path
import sqlite3
import struct


def decode(value):
    if isinstance(value, str):
        vectors = json.loads(value)
        if vectors and isinstance(vectors[0], (int, float)):
            vectors = [vectors]
    elif isinstance(value, bytes) and value[:4] == b"AM01" and len(value) >= 8:
        count, = struct.unpack_from("<I", value, 4)
        if not 1 <= count <= 9 or len(value) != 8+count*(8+768*4):
            raise ValueError("Invalid AM01 length")
        vectors = []
        for start in range(8, len(value), 8+768*4):
            if value[start:start+4] != b"AV01" or struct.unpack_from("<I", value, start+4)[0] != 768:
                raise ValueError("Invalid AV01 header")
            vectors.append(list(struct.unpack_from("<768f", value, start+8)))
    else:
        raise ValueError("Unknown memory vector format")
    if not isinstance(vectors, list) or not 1 <= len(vectors) <= 9:
        raise ValueError("Invalid vector group")
    dimension = len(vectors[0])
    if dimension not in (384, 768) or any(len(v) != dimension or not all(math.isfinite(x) for x in v)
            or not .9 <= sum(x*x for x in v) <= 1.1 for v in vectors):
        raise ValueError("Invalid vector space or normalization")
    return vectors


def convert(connection, target, limit=512):
    converted = before = after = 0
    with connection:
        # Both columns of a passage migrate in one transaction; repeating a
        # completed batch is a no-op. No source or receipt column is touched.
        last_key = ""
        while converted < limit:
            rows = connection.execute("SELECT key,vector,query_vector FROM memory_passages WHERE key>? ORDER BY key LIMIT 512", (last_key,)).fetchall()
            if not rows:
                break
            last_key = rows[-1][0]
            for key, passage, query in rows:
                changes = {}
                for name, value in [("vector", passage), ("query_vector", query)]:
                    if value is None or (target == "json" and isinstance(value, str)) or (target == "binary" and isinstance(value, bytes)):
                        continue
                    vectors = decode(value)
                    if target == "binary" and len(vectors[0]) != 768:
                        continue
                    updated = (b"AM01" + struct.pack("<I", len(vectors)) + b"".join(
                        b"AV01" + struct.pack("<I", 768) + struct.pack("<768f", *v) for v in vectors)) if target == "binary" else json.dumps(vectors, separators=(",", ":"))
                    changes[name] = updated
                    before += len(value.encode() if isinstance(value, str) else value)
                    after += len(updated.encode() if isinstance(updated, str) else updated)
                if changes:
                    for name, value in changes.items():
                        connection.execute(f"UPDATE memory_passages SET {name}=? WHERE key=?", (value, key))
                    converted += 1
                    if converted >= limit:
                        break
    return {"passages": converted, "payloadBytesBefore": before, "payloadBytesAfter": after}


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("--format", choices=["json", "binary"], required=True)
    parser.add_argument("--limit", type=int, default=512)
    args = parser.parse_args()
    database = args.project.resolve()/"ariane.sqlite"
    if not database.is_file() or not 1 <= args.limit <= 4096:
        parser.error("Existing project and a limit between 1 and 4096 required")
    connection = sqlite3.connect(f"{database.as_uri()}?mode=rw", uri=True, timeout=10)
    try:
        print(json.dumps(convert(connection, args.format, args.limit)))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
