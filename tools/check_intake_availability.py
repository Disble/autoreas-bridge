#!/usr/bin/env python3
"""Read-only diagnostic for season intake creation availability.

The Intake UI only enables row selection when a row is matched and its
availability is "available". This script checks the real SQLite read model and
prints the same classification the UI uses, without mutating the database.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any


def default_db_path() -> Path:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise RuntimeError("APPDATA is not set; pass --db explicitly.")
    return Path(appdata) / "Autoreas" / "data" / "bridge.db"


def connect_readonly(path: Path) -> sqlite3.Connection:
    uri = f"file:{path.as_posix()}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    return con


def row_is_visible(row: sqlite3.Row) -> bool:
    return row["match_status"] != "discarded" and row["availability"] != "created"


def row_is_creatable(row: sqlite3.Row) -> bool:
    return row["match_status"] == "matched" and row["availability"] == "available"


def row_is_waiting_for_availability(row: sqlite3.Row) -> bool:
    return row["match_status"] == "matched" and row["availability"] == "waiting"


def fetch_rows(con: sqlite3.Connection) -> tuple[dict[str, Any], list[sqlite3.Row]]:
    season = con.execute(
        """
        SELECT *
        FROM seasons
        WHERE status = 'open'
        ORDER BY created_at DESC
        LIMIT 1
        """,
    ).fetchone()
    if season is None:
        raise RuntimeError("No open season found.")

    rows = con.execute(
        """
        SELECT id, raw_name, match_status, availability, available_chapters, anime_id, matched_slug
        FROM season_animes
        WHERE season_id = ?
        ORDER BY created_at, id
        """,
        (season["id"],),
    ).fetchall()
    return dict(season), rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Check season intake availability/selectability.")
    parser.add_argument("--db", type=Path, default=default_db_path(), help="Path to bridge.db")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    args = parser.parse_args()

    if not args.db.exists():
        raise RuntimeError(f"Database not found: {args.db}")

    with connect_readonly(args.db) as con:
        season, rows = fetch_rows(con)

    visible = [row for row in rows if row_is_visible(row)]
    creatable = [row for row in visible if row_is_creatable(row)]
    waiting = [row for row in visible if row_is_waiting_for_availability(row)]
    unresolved = [row for row in visible if row["match_status"] in {"pending", "ambiguous"}]

    payload = {
        "db": str(args.db),
        "season": {"id": season["id"], "name": season["name"], "status": season["status"]},
        "counts": {
            "visible": len(visible),
            "creatable": len(creatable),
            "waiting_for_availability": len(waiting),
            "unresolved": len(unresolved),
        },
        "ui_create_enabled": len(creatable) > 0,
        "rows": [
            {
                "raw_name": row["raw_name"],
                "match_status": row["match_status"],
                "availability": row["availability"],
                "available_chapters": row["available_chapters"],
                "selectable": row_is_creatable(row),
                "reason": "selectable"
                if row_is_creatable(row)
                else "matched-but-waiting"
                if row_is_waiting_for_availability(row)
                else row["match_status"],
            }
            for row in visible
        ],
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    print(f"DB: {payload['db']}")
    print(f"Open season: {season['name']} ({season['id']})")
    print(
        "Visible rows: {visible} · waiting: {waiting_for_availability} · "
        "creatable: {creatable} · unresolved: {unresolved}".format(**payload["counts"]),
    )
    print(f"UI Create enabled: {payload['ui_create_enabled']}")
    print()
    for row in payload["rows"]:
        print(
            f"- {row['raw_name']} | match={row['match_status']} | "
            f"availability={row['availability']} | selectable={row['selectable']} | {row['reason']}",
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
