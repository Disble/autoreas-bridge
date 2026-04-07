# Proposal: SDD-00 Foundation

## Intent

Establecer el tronco técnico mínimo para que los siguientes cambios SDD trabajen sobre contratos reales y tooling estable, en vez de seguir extendiendo el scaffold de Wails.

## Scope

### In Scope
- Configurar `golangci-lint` para el repo Go.
- Formalizar la decisión de usar SQLite **pure-Go** sin CGO.
- Definir el contrato inicial de `internal/events/bus.go` y eventos base del tronco.
- Cerrar la brecha de verify agregando guardrails negativos del Event Bus y una prueba mínima real del driver SQLite.

### Out of Scope
- Implementar repositorios SQLite completos de `SDD-06`.
- Reemplazar todavía el scaffold de Wails por wiring real de dominios.
- Construir watcher, parser NeDB, REST o WebSocket.

## Approach

Crear una base pequeña pero testeable: lint del repo, paquete `internal/events` con API mínima de pub/sub en memoria y ADR implícita para el driver SQLite. Esto habilita que `SDD-01`, `SDD-02` y `SDD-06` avancen sin redefinir contratos.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.golangci.yml` | New | Reglas de lint para Go |
| `go.mod` | Modified | Dependencia SQLite pure-Go elegida |
| `internal/events/` | New | Contratos y tipos base del Event Bus |
| `internal/sync/` | New/Modified | Smoke test mínimo del driver SQLite |
| `docs/` o `openspec/changes/sdd-00-foundation/` | Modified | Decisión y rationale del driver |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sobre-diseñar el bus demasiado temprano | Med | Mantener API mínima y orientada a tracer bullet |
| Elegir driver SQLite con tradeoffs ocultos | Med | Documentar alternativas y validar compilación sin CGO |
| Reglas de lint demasiado agresivas | Low | Empezar con baseline conservadora |
| Reabrir SDD-00 indefinidamente | Med | Limitar la reapertura a gaps concretos de verify |

## Rollback Plan

Revertir `.golangci.yml`, remover el paquete `internal/events` y volver a `go.mod` previo si el driver elegido rompe compatibilidad o el lint bloquea el desarrollo inicial.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- Wails scaffold actual (`main.go`, `app.go`)

## Success Criteria

- [ ] El repo define un lint reproducible con `golangci-lint run`.
- [ ] La decisión SQLite pure-Go queda documentada con tradeoffs claros.
- [ ] Existe un contrato inicial de Event Bus reutilizable por los siguientes SDD.
- [ ] El Event Bus cubre guardrails negativos mínimos exigidos por `bridge-testing`.
- [ ] Existe una prueba real mínima que abre SQLite con el driver elegido sin requerir CGO.
