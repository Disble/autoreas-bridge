## Exploration: SDD-02.5 SQLite Bootstrap

### Current State
El repo ya tomó la decisión de usar SQLite pure-Go con `modernc.org/sqlite` y hoy esa evidencia existe solo como smoke test en memoria (`internal/sync/sqlite_driver_test.go`). No existe todavía bootstrap runtime de SQLite: no hay resolución de ruta UAC-safe, no hay apertura de DB file-backed, no hay `PRAGMA journal_mode=WAL`, no hay `PRAGMA busy_timeout`, no hay tablas reales, y `main.go` / `app.go` siguen siendo el scaffold de Wails sin wiring de dominios. `SDD-03` ya depende explícitamente de que exista `anime_snapshots`, así que este cambio debe dejar lista solo la infraestructura mínima de arranque de SQLite, sin invadir parser/snapshots completos de `SDD-03` ni repositorios completos de `SDD-06`.

### Affected Areas
- `go.mod` — `modernc.org/sqlite` hoy está como indirecta; al usarlo en runtime pasará a dependencia directa.
- `main.go` — punto natural para iniciar el bootstrap mínimo al arrancar el proceso.
- `app.go` — hoy no hace bootstrap; puede necesitar coordinación mínima de startup según dónde se conecte el arranque real.
- `internal/sync/` — hoy solo contiene el smoke test del driver; es el lugar más probable para crear bootstrap/path/schema SQLite.
- `internal/anime/` — no debería cambiar lógica todavía, pero `SDD-03` dependerá de la tabla `anime_snapshots` creada acá.
- `openspec/changes/sdd-02-5-sqlite-bootstrap/*` — proposal/design/spec/tasks del cambio.

### Approaches
1. **Bootstrap encapsulado en `internal/sync`** — crear un componente chico de infraestructura (`ResolveDBPath` + `OpenBootstrapDB` + `EnsureAnimeSnapshotsSchema`) y llamarlo desde startup.
   - Pros: mantiene hexagonalidad razonable, reutilizable para `SDD-06`, reduce lógica en `main.go`.
   - Cons: obliga a definir contratos mínimos antes del wiring completo de `SDD-01`.
   - Effort: Medium

2. **Bootstrap inline en `main.go`** — resolver path, abrir DB y ejecutar PRAGMAs/DDL directo en arranque.
   - Pros: más rápido para destrabar `SDD-03`.
   - Cons: mete infraestructura en composición raíz, deja deuda para `SDD-06`, peor testabilidad.
   - Effort: Low

### Recommendation
Ir con **Approach 1**. Este cambio tiene que ser mínimo, pero NO descartable como parche temporal. Lo correcto es dejar un bootstrap de SQLite pequeño, testeable y reusable en `internal/sync`, con wiring mínimo desde startup. Alcance exacto: resolver `%APPDATA%\Autoreas\data\bridge.db` vía `os.UserConfigDir()`, crear el directorio si falta, abrir la conexión con `modernc.org/sqlite`, aplicar `PRAGMA journal_mode=WAL;` y `PRAGMA busy_timeout=5000;`, y crear solo la tabla `anime_snapshots`. Nada de changelog/conflicts/devices todavía.

### Risks
- Confundir SDD-02.5 con SDD-06 y terminar metiendo repositorios/tablas de más.
- Probar solo `:memory:` y no cubrir el boundary real de path UAC-safe + DB file-backed.
- Aplicar WAL/timeout de forma no verificable y descubrir `SQLITE_BUSY` recién en cambios posteriores.
- Acoplar el bootstrap a Wails/scaffold actual de una forma que complique el wiring real posterior.

### Ready for Proposal
Yes — el cambio ya está suficientemente acotado. Proposal/design/spec/tasks deberían abrirse con nombre `sdd-02-5-sqlite-bootstrap`, scope mínimo de infraestructura, y slices TDD así: (1) path resolver UAC-safe + creación de directorio, (2) apertura real file-backed con driver pure-Go, (3) verificación de PRAGMAs WAL + `busy_timeout=5000`, (4) creación idempotente de `anime_snapshots`, (5) wiring mínimo de startup que demuestre que el proceso arranca con ese bootstrap listo para `SDD-03`.
