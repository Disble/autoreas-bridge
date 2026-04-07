# Foundation Specification

## Purpose

Definir el baseline técnico del proyecto para que los dominios trabajen sobre contratos y tooling comunes desde el primer tracer bullet.

## Requirements

### Requirement: Go lint baseline

The system MUST define a repository-level Go lint configuration that can run consistently during verification.

#### Scenario: Lint command is standardized
- GIVEN the repository is opened on a machine with Go and golangci-lint installed
- WHEN the maintainer runs `golangci-lint run`
- THEN the command SHALL use a committed repo configuration
- AND the configuration SHALL target current Go source files in the project

#### Scenario: Frontend-only files do not redefine Go linting
- GIVEN the repository contains Wails frontend assets
- WHEN lint verification is executed for SDD-00
- THEN the Go lint baseline MUST remain scoped to Go concerns

### Requirement: SQLite driver decision

The system MUST standardize on a SQLite driver that compiles on Windows without requiring CGO or GCC.

#### Scenario: Driver choice supports Windows packaging
- GIVEN the bridge is intended to ship as a Windows executable
- WHEN SQLite support is introduced by later SDD changes
- THEN the selected driver SHALL be pure-Go
- AND the design record SHALL explain why CGO-based options were rejected

#### Scenario: Decision is reusable by later changes
- GIVEN future work in `SDD-02.5` and `SDD-06`
- WHEN those changes need SQLite access
- THEN they MUST reuse the documented driver choice instead of re-opening the decision

### Requirement: Event bus trunk contract

The system MUST define an in-memory Event Bus contract for cross-domain publication and subscription.

#### Scenario: Publishers and subscribers share one contract
- GIVEN domains such as anime, sync, device, and system
- WHEN they exchange runtime events
- THEN they SHALL depend on `internal/events` contracts rather than concrete domain implementations

#### Scenario: Contract supports tracer bullets first
- GIVEN the codebase is still on the Wails starter scaffold
- WHEN the first tracer bullets are implemented
- THEN the Event Bus API SHOULD stay minimal
- AND it MAY use dummy publishers/subscribers before real domain logic exists
