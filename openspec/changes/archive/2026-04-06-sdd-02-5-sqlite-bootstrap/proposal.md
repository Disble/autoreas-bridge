# Proposal: SDD-02.5 SQLite Bootstrap

## Intent

Inicializar la persistencia SQLite mínima del bridge en una ruta segura para Windows, con configuración de concurrencia básica y schema inicial, para desbloquear SDD-03 sin adelantar todavía los repositorios completos de SDD-06.

## Scope

### In Scope
- Resolver una ruta UAC-safe para `bridge.db` usando `os.UserConfigDir()`.
- Crear el directorio `Autoreas/data` si no existe.
- Abrir SQLite file-backed con el driver pure-Go `modernc.org/sqlite`.
- Aplicar `PRAGMA journal_mode=WAL`.
- Aplicar `PRAGMA busy_timeout=5000`.
- Crear la tabla `anime_snapshots` de forma idempotente.
- Dejar un bootstrap reusable por SDD-03.

### Out of Scope
- Repositorios completos y tablas adicionales de SDD-06.
- Parser de `animes.dat`, snapshots efectivos o diff por `_id`.
- Wiring completo de dominios, HTTP o Wails bindings.

## Approach

Encapsular el bootstrap SQLite en un componente chico y reusable, preferentemente bajo `internal/sync`, que resuelva path, abra la base, aplique PRAGMAs y cree `anime_snapshots`. El arranque del proceso solo debe delegar a ese bootstrap para dejar lista la infraestructura mínima requerida por SDD-03.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/sync/` | Modified/New | Bootstrap SQLite, path UAC-safe y schema mínimo |
| `main.go` o wiring equivalente | Modified | Inicialización mínima del bootstrap |
| `internal/sync/*_test.go` | Modified/New | Tests file-backed, PRAGMAs y schema idempotente |
| `openspec/changes/sdd-02-5-sqlite-bootstrap/` | New | Artefactos SDD del cambio |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Inflar el scope con repositorios completos de SDD-06 | Med | Limitarse a path, open, PRAGMAs y `anime_snapshots` |
| Tests engañosos solo con `:memory:` | High | Usar al menos un test file-backed con path real o temp equivalente |
| Omitir validación observable de WAL y `busy_timeout` | Med | Leer PRAGMAs tras bootstrap y asertar sus valores |
| Acoplar bootstrap de DB directo en `main.go` | Med | Encapsular la lógica en una API reusable del paquete de sync |

## Rollback Plan

Revertir el bootstrap SQLite, eliminar el wiring mínimo y remover la creación de `anime_snapshots` si el cambio introduce problemas de arranque o paths incompatibles con Windows.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `openspec/changes/sdd-00-foundation/`
- `modernc.org/sqlite` ya decidido en `go.mod`

## Success Criteria

- [ ] El bridge puede resolver un path UAC-safe para `bridge.db`.
- [ ] La conexión SQLite abre sin CGO usando `modernc.org/sqlite`.
- [ ] `journal_mode=WAL` y `busy_timeout=5000` quedan aplicados y verificables.
- [ ] La tabla `anime_snapshots` se crea de forma idempotente.
- [ ] El bootstrap queda reusable para SDD-03 sin redefinir infraestructura base.
