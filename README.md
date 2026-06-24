# Autoreas Bridge

Autoreas Bridge acts as a seamless, local-first synchronization bridge between the legacy Autoreas Desktop application and its companion devices over a local WiFi network. 

By observing and interacting directly with the legacy app's underlying data store (`animes.dat`), the Bridge achieves bi-directional synchronization without altering a single byte of the original Autoreas Desktop source code.

## Key Features

- **Local Network Synchronization:** Real-time peer-to-peer sync locally. No cloud servers or internet access required.
- **Non-Destructive Legacy Integration:** Custom parser and file watcher natively integrate with the legacy NeDB file (`animes.dat`).
- **Intelligent Conflict Resolution:** Utilizes an embedded SQLite database to track changelogs and perform CRDT-like semantic reconciliation to prevent data loss.
- **Concurrent Write Protection:** Employs an append-only, single-threaded write queue to safely update the legacy database on Windows without concurrent file locks.
- **Real-Time & Peer-to-Peer:** Exposes a local REST API and WebSocket server for real-time state updates with device pairing based on raw LAN IP + QR/Token, using one-shot pairing tokens and persistent auth tokens.
- **Lightweight Desktop App:** Built with Go and Wails v2 (React/Vite frontend). Runs silently in the Windows system tray with a low memory footprint (~15MB idle). Provides a clean UI for managing paired devices, viewing sync logs, and resolving conflicts manually.

## Architecture

This project strictly adheres to **Hexagonal Architecture (Ports & Adapters)** on the backend and enforces a **Strict Smart Hooks / Dumb UI** pattern on the frontend. 

For architectural deep dives, see:
- [Architecture Overview](docs/architecture.md)
- [Design Document](docs/autoreas-bridge-design-doc.md)

## Tech Stack

- **Backend:** Go 1.21+, SQLite, Wails v2, Event Bus
- **Frontend:** React, Vite, Tailwind CSS v4, HeroUI
- **Tooling:** Bun, Lefthook (Pre-commit)

## Development

### Prerequisites

- [Go](https://go.dev/dl/) 1.21+
- [Bun](https://bun.sh/) or Node.js
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

### Running Locally

To run in live development mode, run the following in the project root:

```bash
wails dev
```

This will run a Vite development server that provides very fast hot reload of your frontend changes, along with the Go backend. A local inspector is available at `http://localhost:34115`.

### Testing

Tests are an integral part of this project.

- **Frontend:** Run `bun run test` in the `frontend/` directory (requires colocated `__tests__/` for all helpers/hooks).
- **Backend:** Run `go test ./...` in the project root.

#### Running the race detector (`go test -race`) on Windows

`go test -race` requires cgo and a **GCC/Clang-style** C compiler. On Windows the
Go toolchain does **not** work with MSVC's `cl.exe`, and a compiler path
containing spaces (e.g. `C:\Program Files (x86)\...`) breaks the cgo invocation.
If `go env CC` points at `cl.exe`, `-race` will fail with a cgo/compiler error
(the normal `go build`/`go test` still work — the SQLite driver is pure-Go).

To enable `-race` locally, install [MinGW-w64](https://www.mingw-w64.org/) (e.g.
via `winget install -e --id MartinStorsjo.LLVM-MinGW` or MSYS2) into a
space-free path and point the toolchain at it:

```bash
go env -w CC=C:/mingw64/bin/gcc.exe
go env -w CXX=C:/mingw64/bin/g++.exe
go test ./... -race
```

Alternatively run the race detector under WSL or CI, where a GCC toolchain is
already present. The pre-commit gate does **not** run `-race`, so this is only
needed for local race investigation.

### Building for Production

To build a redistributable, production-ready executable package:

```bash
wails build
```

## Contributing

This project relies on **Spec-Driven Development (SDD)** orchestrated via `.atl` and `openspec/`. 
All major changes must pass through a structured flow of: `Explore -> Propose -> Spec -> Design -> Tasks -> Apply -> Verify -> Archive`. Direct feature commits without SDD artifacts will fail the pipeline.

Ensure your code passes all `lefthook` pre-commit checks before pushing.
