# Development database

Decision (owner, 2026-10-17): development of debug capture runs against a **copy** of the database, never
the live file.

## Why

Before this change the bridge resolved its database path from `os.UserConfigDir()` with no override, so a
build from any worktree opened the owner's real `%APPDATA%/Autoreas/data/bridge.db`. That was a
deliberate convenience: one database for development and daily use, with no APK changes on the phone.
This feature deletes and reorganizes capture data, though, and a mistake mid-development would land on
the real file.

## How it works

```
 Phone ──────▶ everyday bridge  ──▶ %APPDATA%/Autoreas/data/bridge.db   (unchanged)

 Worktree ───▶ development bridge ──▶ <copy dir>/bridge.db              (another port, its own lock)
                        ▲
          go run ./tools/devdata -to <copy dir>   (VACUUM INTO, about 2 s, live file opened read-only)
```

### 1. Refresh the copy

```bash
go run ./tools/devdata -to D:/dev/disble/autoreas-sp/autoreas-bridge-devdata
```

- Opens the live file **read-only** and writes a consistent copy with `VACUUM INTO`, while the everyday
  bridge keeps running. Measured on 2026-10-17: 1.7 s. The live file's hash was unchanged, and the copy was
  21.3 MB against 38.9 MB live, because free pages are not copied.
- Replaces the previous copy and its `-wal`/`-shm` sidecars.
- Refuses the live directory, a relative path and an empty target.
- Keeps copies **outside** the worktree. A copy is never committed.

### 2. Start a development bridge on the copy

```bash
AUTOREAS_DATA_DIR=D:/dev/disble/autoreas-sp/autoreas-bridge-devdata \
AUTOREAS_BRIDGE_ADDR=127.0.0.1:8899 \
wails dev
```

With `AUTOREAS_DATA_DIR` set (`internal/sync/sqlite_bootstrap_datadir.go`):

| Concern | Behavior |
|---|---|
| Database | `<dir>/bridge.db`. The directory must be absolute and must not be the live data directory, or startup fails instead of silently falling back to the real file |
| Single-instance lock | its own lock id per copy directory, so it runs beside the everyday bridge instead of handing off to it and exiting |
| Windows login launch | never reconciled. The copy's preference is stored, but the registry belongs to the everyday bridge |
| Request MCP | `autoreas-request-mcp` reads the same variable, so it can inspect the copy |

Unset, everything behaves exactly as before.

### Shared on purpose

- The cover thumbnail cache (`os.UserCacheDir()/autoreas-bridge/covers`) is derived data and safe to share.
- The JDownloader settings path (`%APPDATA%/Autoreas/Settings`) is read-only configuration.

## Trade-off

The development bridge does not see the phone **live**. Phone data reaches it by refreshing the copy.
Before the worktree is delivered, one rehearsal runs the new code against the real file, after a backup.

## Rules

- Never point a development build at `%APPDATA%/Autoreas/data`. The bridge refuses it.
- Never commit a database copy.
