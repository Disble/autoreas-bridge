# Autoreas Bridge

Autoreas Bridge is a local-first, offline-capable anime tracker. It is the
**sole owner** of anime state: every catalog entry, schedule, and progress
update lives in Bridge's own embedded SQLite database, with no external
file or companion process required to read or write it.

**Historical origin:** Bridge began as a synchronization bridge that
observed and mirrored a legacy Windows desktop app's NeDB-style data file
(`animes.dat`) to companion devices over LAN. SDD-55 retired that
synchronization channel entirely: Bridge no longer reads, writes, or
watches any Legacy file, and does not sync with the Legacy Desktop app.
Users who still run the Legacy app get **no synchronization** from this
version of Bridge — its catalog and Bridge's SQLite database are
independent going forward. The name "Bridge" is kept for continuity, even
though it no longer bridges to anything external.

## Key Features

- **Local Network Synchronization:** Real-time peer-to-peer sync between Bridge and its companion mobile app locally. No cloud servers or internet access required.
- **SQLite-Native Persistence:** All anime state (catalog, schedule, progress) is read from and written directly to an embedded SQLite database — no external file format, parser, or watcher involved.
- **Intelligent Conflict Resolution:** Utilizes the same embedded SQLite database to track changelogs and perform CRDT-like semantic reconciliation to prevent data loss across paired devices.
- **Real-Time & Peer-to-Peer:** Exposes a local REST API and WebSocket server for real-time state updates with device pairing based on raw LAN IP + QR/Token, using one-shot pairing tokens and persistent auth tokens.
- **Lightweight Desktop App:** Built with Go and Wails v2 (React/Vite frontend). Runs silently in the Windows system tray with a low memory footprint (~15MB idle). Provides a clean UI for managing paired devices, viewing sync logs, and resolving conflicts manually.

## Architecture

This project strictly adheres to **Hexagonal Architecture (Ports & Adapters)** on the backend and enforces a **Strict Smart Hooks / Dumb UI** pattern on the frontend. 

For architectural deep dives, see:
- [Architecture Overview](docs/architecture.md)
- [Original RFC (historical design rationale)](docs/autoreas-bridge-rfc.md)

## Tech Stack

- **Backend:** Go 1.27+, SQLite, Wails v2, Event Bus
- **Frontend:** React, Vite, Tailwind CSS v4, HeroUI
- **Tooling:** Bun, Lefthook (Pre-commit)

## Development

### Prerequisites

- [Go](https://go.dev/dl/) 1.21+
- [Bun](https://bun.sh/) or Node.js
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

The Wails CLI is not optional here: `frontend/wailsjs/` holds the generated
TypeScript bindings for every bound Go method, it is not tracked, and fifteen
frontend files import from it. `bun install` regenerates it through a
postinstall hook, so a fresh clone needs nothing else — but without the CLI on
your PATH the frontend will not typecheck.

### Running Locally

To run in live development mode, run the following in the project root:

```bash
wails dev
```

After changing a bound Go method, regenerate the bindings so the frontend sees
the new signature:

```bash
bun --cwd="frontend" run generate:bindings
```

`wails dev` and `wails build` regenerate them too; the script exists for when
you are working on the frontend alone.

This will run a Vite development server that provides very fast hot reload of your frontend changes, along with the Go backend. A local inspector is available at `http://localhost:34115`.

### Testing

Tests are an integral part of this project.

- **Frontend:** Run `bun run test` in the `frontend/` directory (requires colocated `__tests__/` for all helpers/hooks).
- **Backend:** Run `go test ./...` in the project root.

### Go linting

Run `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1 -Profile base` for the enforced Go lint profile. The tracked entrypoint provisions the `golangci-lint` version pinned in `scripts/lint.ps1`, building it once into `.tools/bin` and reusing it. Run it with `-Profile advanced` to build the tracked dlinter plugin and scan the same repository-owned Go packages.

### Building for Production

To build a redistributable, production-ready executable package:

```bash
wails build
```

## Contributing

This project relies on **Spec-Driven Development (SDD)** orchestrated via `.atl` and `openspec/`. 
All major changes must pass through a structured flow of: `Explore -> Propose -> Spec -> Design -> Tasks -> Apply -> Verify -> Archive`. Direct feature commits without SDD artifacts will fail the pipeline.

Ensure your code passes all `lefthook` pre-commit checks before pushing.
