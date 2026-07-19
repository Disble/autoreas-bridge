#!/usr/bin/env python3
"""Live probe for first-episode pages of matched intake rows.

This script is intentionally read-only. It checks the real bridge SQLite intake
rows, then requests `<matched_slug>/1/` from jkanime to verify whether episode 1
is reachable even when the local availability read model says "waiting".
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es,en;q=0.9",
}


def default_db_path() -> Path:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise RuntimeError("APPDATA is not set; pass --db explicitly.")
    return Path(appdata) / "Autoreas" / "data" / "bridge.db"


def connect_readonly(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def fetch_waiting_matched_rows(con: sqlite3.Connection) -> list[sqlite3.Row]:
    return con.execute(
        """
        SELECT raw_name, matched_slug, availability, available_episodes
        FROM season_animes
        WHERE season_id IN (SELECT id FROM seasons WHERE status = 'open')
          AND match_status = 'matched'
          AND availability = 'waiting'
          AND COALESCE(matched_slug, '') <> ''
        ORDER BY created_at, id
        """,
    ).fetchall()


def first_episode_url(page_url: str) -> str:
    return page_url.rstrip("/") + "/1/"


def probe_url(url: str, timeout: float) -> dict[str, Any]:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(16_384).decode("utf-8", "ignore")
            return {
                "status": resp.status,
                "final_url": resp.geturl(),
                "reachable": resp.status == 200,
                "body_has_video_marker": "video" in body.lower() or "var servers" in body,
                "error": "",
            }
    except urllib.error.HTTPError as exc:
        return {
            "status": exc.code,
            "final_url": url,
            "reachable": False,
            "body_has_video_marker": False,
            "error": f"HTTP {exc.code}",
        }
    except Exception as exc:
        return {
            "status": 0,
            "final_url": url,
            "reachable": False,
            "body_has_video_marker": False,
            "error": str(exc),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe matched waiting intake rows for reachable episode 1 pages.")
    parser.add_argument("--db", type=Path, default=default_db_path(), help="Path to bridge.db")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout per page")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    args = parser.parse_args()

    with connect_readonly(args.db) as con:
        rows = fetch_waiting_matched_rows(con)

    results = []
    for row in rows:
        url = first_episode_url(row["matched_slug"])
        probe = probe_url(url, args.timeout)
        results.append(
            {
                "raw_name": row["raw_name"],
                "matched_slug": row["matched_slug"],
                "db_availability": row["availability"],
                "db_available_episodes": row["available_episodes"],
                "first_episode_url": url,
                **probe,
            },
        )

    payload = {
        "db": str(args.db),
        "checked": len(results),
        "reachable_first_episode": sum(1 for r in results if r["reachable"]),
        "missing_first_episode": sum(1 for r in results if not r["reachable"]),
        "results": results,
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    print(f"DB: {payload['db']}")
    print(
        f"Matched waiting rows checked: {payload['checked']} · "
        f"episode 1 reachable: {payload['reachable_first_episode']} · "
        f"missing/error: {payload['missing_first_episode']}",
    )
    print()
    for result in results:
        marker = "YES" if result["reachable"] else "NO"
        print(f"- {marker} | {result['raw_name']} | {result['first_episode_url']} | {result['error']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
