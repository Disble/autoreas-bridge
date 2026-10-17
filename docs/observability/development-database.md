# Development database

Decision (owner, 2026-10-17): development of debug capture runs against a **copy** of the database, never
the live file.

## Why

The bridge resolves its database path from `os.UserConfigDir()` with no override
(`internal/sync/sqlite_bootstrap.go`), so a build from any worktree opens the owner's real
`%APPDATA%/Autoreas/data/bridge.db`. That was a deliberate convenience: one database for development and
daily use, with no APK changes on the phone. This feature deletes and reorganizes capture data, though,
and a mistake mid-development would land on the real file.

## How it works

```
 Phone ──────▶ everyday bridge  ──▶ real bridge.db         (unchanged)

 Worktree ───▶ development bridge ──▶ copy of bridge.db     (another port)
                        ▲
          refresh copy = VACUUM INTO, a few seconds, today's phone data included
```

- A new environment variable names the data directory. Unset, the bridge behaves exactly as today. The
  name is planned as `AUTOREAS_DATA_DIR`, next to the existing `AUTOREAS_BRIDGE_ADDR`.
- The development bridge listens on another address through `AUTOREAS_BRIDGE_ADDR`, so it never competes
  with the everyday bridge.
- Refreshing the copy uses `VACUUM INTO`, which reads the live file safely while the everyday bridge keeps
  running.
- The phone stays paired with the everyday bridge. No APK changes are needed.

## Trade-off

The development bridge does not see the phone **live**. Phone data reaches it by refreshing the copy.
Before the worktree is delivered, one rehearsal runs the new code against the real file, after a backup.

## Rules

- Never point a development build at `%APPDATA%/Autoreas/data`.
- Never commit a database copy. Copies live outside the worktree.
