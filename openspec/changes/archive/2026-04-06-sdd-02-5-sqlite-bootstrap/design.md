# Design: SDD-02.5 SQLite Bootstrap

## Technical Approach

Crear un bootstrap SQLite mínimo y reusable que viva cerca del dominio Sync, resuelva el path UAC-safe del bridge, abra una conexión file-backed con `modernc.org/sqlite`, aplique los PRAGMAs requeridos y cree la tabla `anime_snapshots` con `CREATE TABLE IF NOT EXISTS`. La intención es dejar lista la infraestructura mínima para que SDD-03 pueda persistir snapshots sin duplicar decisiones de conexión o path.

## Architecture Decisions

### Decision: encapsular el bootstrap SQLite fuera de `main.go`

**Choice**: ubicar el bootstrap en `internal/sync` o infraestructura cercana y exponer una API chica reusable.
**Alternatives considered**: inicializar SQLite inline en `main.go`; crear ya un repositorio completo.
**Rationale**: poner lógica de path/PRAGMAs/schema directo en `main.go` mete deuda temprana; crear repos completos adelanta scope de SDD-06. Un bootstrap chico respeta hexagonalidad y destraba SDD-03.

### Decision: usar ruta UAC-safe basada en `os.UserConfigDir()`

**Choice**: resolver `%APPDATA%/Autoreas/data/bridge.db` vía `os.UserConfigDir()`.
**Alternatives considered**: path relativo al binario; `:memory:`; escribir bajo `C:\Program Files`.
**Rationale**: el diseño del proyecto exige evitar fallos silenciosos por UAC en Windows cuando el binario reside en ubicaciones protegidas.

### Decision: aplicar WAL + `busy_timeout` en el bootstrap

**Choice**: ejecutar `PRAGMA journal_mode=WAL;` y `PRAGMA busy_timeout=5000;` inmediatamente después de abrir la conexión.
**Alternatives considered**: deferirlos a repositorios futuros; usar configuración por defecto de SQLite.
**Rationale**: SDD-03 y SDD-06 van a depender de una conexión ya endurecida frente a concurrencia; dejar los PRAGMAs para después multiplica puntos de fallo.

## Data Flow

```text
Startup/main
   └── SQLite bootstrap
         ├── Resolve user config path
         ├── Ensure Autoreas/data directory exists
         ├── Open bridge.db with modernc.org/sqlite
         ├── Apply WAL + busy_timeout
         └── Create anime_snapshots if missing
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/sync/` | Modify/New | Bootstrap SQLite y schema mínimo reusable |
| `internal/sync/*_test.go` | Modify/New | Tests de path, file-backed open, PRAGMAs y schema |
| `main.go` o wiring equivalente | Modify | Integración mínima del bootstrap en startup |
| `openspec/changes/sdd-02-5-sqlite-bootstrap/*` | Create | Artefactos del cambio |

## Interfaces / Contracts

```go
package sync

type SQLiteBootstrap interface {
	Open() (*sql.DB, error)
}

func ResolveBridgeDBPath() (string, error)
func OpenBridgeDB(path string) (*sql.DB, error)
func BootstrapBridgeDB() (*sql.DB, error)
```

Contratos clave:
- `ResolveBridgeDBPath()` MUST devolver una ruta escribible por el usuario actual.
- `OpenBridgeDB()` MUST abrir una base file-backed con `modernc.org/sqlite`.
- `BootstrapBridgeDB()` MUST dejar la conexión con WAL, `busy_timeout=5000` y `anime_snapshots` creada.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Resolución de ruta UAC-safe | Tests controlando base dir / helpers de path |
| Integration | Apertura file-backed real | `go test` contra archivo temporal o path resuelto |
| Integration | PRAGMAs aplicados | Consultar `PRAGMA journal_mode` y `PRAGMA busy_timeout` tras bootstrap |
| Integration | Schema idempotente | Ejecutar bootstrap dos veces y verificar que `anime_snapshots` exista sin errores |
| Unit/Integration | Wiring mínimo | Confirmar que el arranque puede invocar el bootstrap sin mezclar lógica de dominio |

## Migration / Rollout

No migration required beyond creating `bridge.db` and `anime_snapshots` on first run.

## Open Questions

- [ ] Confirmar el shape mínimo exacto de `anime_snapshots` requerido por SDD-03 para evitar rework leve.
- [ ] Definir dónde se sostendrá la referencia viva a `*sql.DB` hasta que exista wiring de dominios más completo.
