# Proposal: SDD-08 Reconciliación Semántica (CRDT-like)

## Intent
Crear una función pura y predictible para reconciliar los cambios locales y remotos en el estado de un anime. El objetivo es unificar la fuente de verdad mediante un enfoque CRDT-like (`MAX(local.nrocapvisto, remote.nrocapvisto)`) eliminando conflictos de sincronización dependientes del timestamp.

## Scope

### In Scope
- Definición del tipo `ReconcileEntry` (DTO de entrada/salida).
- Implementación de la función pura `Reconcile(local, remote)`.
- Soporte para números de capítulo fraccionales (ej. `0.5`).
- Emisión lógica de `AnimeUpdateRequestedEvent` (como resultado de la función pura, pero sin conectarla al EventBus real).
- Casos de prueba exhaustivos (matrices cruzadas de estado).

### Out of Scope
- Integración real con el EventBus (responsabilidad del caller).
- Lectura/Escritura en Base de Datos (SQLite) o red.
- Manipulación o parseo directo de `animes.dat`.
- Sincronización inicial (First-sync boot).

## Approach
Implementar un `Reconciliation Engine` como una función matemática pura en `internal/sync/reconcile.go` (o similar). La función tomará dos estructuras de estado (local y remoto) y aplicará la regla del máximo `MAX(nrocapvisto)` ignorando el esquema LWW (Last-Write-Wins) basado en timestamp. Si el estado remoto gana o hay actualización, se devuelve una estructura que indica qué evento disparar.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/sync/reconciler.go` | New | Contiene la función pura y tipos DTO. |
| `internal/sync/reconciler_test.go` | New | Unit tests (100% coverage, matrices de estado). |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tombstones (`activo=false`) | Medium | Definir explícitamente el comportamiento: ignorarlos o propagarlos. |
| First-sync edge case | Low | Deferido (Out of Scope), pero la función maneja `nil` gracefully. |
| Float noise (ej. 0.5000001) | Medium | Usar un delta pequeño para la comparación en el `MAX()` o normalización a un decimal. |

## Rollback Plan
Revertir el merge o commit del motor de reconciliación. Al ser una función pura, se elimina el archivo y el caller correspondiente sin afectar el estado persistido.

## Dependencies
- Ninguna. 100% Go estándar.

## Success Criteria
- [ ] Función `Reconcile` implementada y pura (cero I/O).
- [ ] Tests unitarios pasando al 100% incluyendo casos fraccionales (0.5).
- [ ] Soporta el caso base de `MAX` correctamente sin importar timestamps.