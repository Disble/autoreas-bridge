# Tasks — sdd-40-estado-labels

## 1. RED — flip tests to the canonical vocabulary

- [ ] 1.1 NEW `shared/constants/__tests__/anime-estado.test.ts` — full 0–3
      map + fallback + filter entries shape
- [ ] 1.2 `history-table.helpers.test.ts` — 2→"No me gusto", 3→"En pausa"
- [ ] 1.3 `anime-detail.helpers.test.ts` — same + subtitle case
- [ ] 1.4 `AnimeDetail.test.tsx` — estadoLabel/subtitle fixtures
- [ ] 1.5 Chapters tests (helpers/Card/Panel) — "Watching"→"Viendo",
      "Completed"→"Finalizado" in labels and accessible names
- [ ] 1.6 Run suite — confirm RED for exactly these reasons

## 2. GREEN — implement

- [ ] 2.1 NEW `shared/constants/anime-estado.ts` (labels map, getter,
      filter entries; JSDoc)
- [ ] 2.2 Migrate History constants + helpers
- [ ] 2.3 Migrate AnimeDetail helpers
- [ ] 2.4 Migrate Catalog constants
- [ ] 2.5 Migrate Chapters constants
- [ ] 2.6 Run suite — GREEN

## 3. Docs & gate

- [ ] 3.1 Docs sweep (grep "Abandonado"/"Pendiente"/"Dropped" as estado)
- [ ] 3.2 `autoreas-theme` SKILL.md vocabulary entry + version bump
- [ ] 3.3 Full gate: frontend tests, lint, filesize; zero stale-label greps
