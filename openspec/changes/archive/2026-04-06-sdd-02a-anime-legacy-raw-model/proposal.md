# Proposal: SDD-02A Anime Legacy Raw Model

## Intent

Definir el modelo raw de compatibilidad para `animes.dat` dentro del dominio Anime, preservando las irregularidades reales del schema legacy para que el bridge pueda parsear y reserializar registros sin pérdida antes de avanzar al parser consolidado de SDD-03.

## Scope

### In Scope
- Crear `internal/anime/domain/anime.go` y `internal/anime/domain/anime_raw.go`.
- Definir `LegacyAnimeRaw` y tipos auxiliares para compatibilidad con NeDB JSON-line.
- Soportar `$$date` con un `json.Unmarshaler`/`json.Marshaler` dedicado.
- Preservar campos opcionales o `null` sin colapsarlos a zero-values de Go.
- Modelar `activo` como tri-state (`true`, `false`, ausente).
- Soportar `nrocapvisto` fraccional.
- Tolerar variantes históricas `dia`/`orden` y `dias[]`.
- Demostrar round-trip lossless con tests sintéticos y fixture real `resources/autoreas-data/animes.dat`.

### Out of Scope
- Implementar todavía el parser consolidado de archivo línea a línea de SDD-03.
- Implementar watcher, snapshots SQLite o writer append-only.
- Exponer todavía servicios, comandos o endpoints HTTP del dominio Anime.

## Approach

Separar explícitamente modelo raw y modelo de dominio. `LegacyAnimeRaw` absorbe rarezas del archivo legacy y conserva presencia, ausencia y `null` para permitir round-trip fiel; `Anime` queda como base semántica del dominio. La validación se apoya en Strict TDD con tests unitarios chicos para cada rareza del schema y un test de compatibilidad usando la copia real de `resources/autoreas-data/animes.dat`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/anime/domain/` | New | Modelo de dominio Anime y modelo raw legacy |
| `internal/anime/domain/anime_raw_test.go` | New | Tests TDD de parseo, nulabilidad y round-trip |
| `resources/autoreas-data/animes.dat` | Reference | Fixture real de compatibilidad en modo solo lectura |
| `openspec/changes/sdd-02a-anime-legacy-raw-model/` | New | Artefactos SDD del cambio |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Colapsar ausencia y `null` a zero-values de Go | High | Usar punteros o wrappers lossless y cubrir con tests de round-trip |
| Confundir `activo=false` con tombstone | Med | Modelar tri-state explícito y cubrir casos `true`, `false`, ausente |
| Confiar solo en el fixture real y dejar huecos sin cubrir | High | Complementar con payloads sintéticos para `activo` ausente y schema viejo |
| Mezclar raw model con dominio semántico demasiado temprano | Med | Mantener separación explícita `Anime` vs `LegacyAnimeRaw` |

## Rollback Plan

Revertir `internal/anime/domain/*` y remover el cambio OpenSpec si el modelo raw introduce una representación incompatible con el legacy o complica innecesariamente los siguientes SDD.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `docs/autoreas-bridge-design-doc.md`
- `resources/autoreas-data/animes.dat`

## Success Criteria

- [ ] Existe `LegacyAnimeRaw` con soporte explícito para opcionales, `null` y tri-state de `activo`.
- [ ] El modelo soporta `$$date` sin perder compatibilidad al remarshaling.
- [ ] `nrocapvisto` acepta valores fraccionales como `0.5`.
- [ ] El modelo tolera tanto `dia`/`orden` como `dias[]`.
- [ ] Los tests sintéticos prueban round-trip lossless del payload raw.
- [ ] El fixture real `resources/autoreas-data/animes.dat` parsea sin errores en las líneas válidas requeridas por este cambio.
