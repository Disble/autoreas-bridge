# Proposal — sdd-40-estado-labels

## Intent

Fix the estado label drift: bridge renders estado 2 as "Abandonado"/"Dropped"
and estado 3 as "Pendiente"/"Paused", but Legacy's truth (Historial UI,
user-confirmed 2026-07-05) is **2="No me gusto"** and **3="En pausa"**. The
season-selection program (SDD-39) builds directly on "No me gusto" — the base
must be correct first.

## Scope

- One canonical Spanish vocabulary (`Viendo / Finalizado / No me gusto /
  En pausa`) in a GLOBAL shared constants module (user decision — explicit,
  recorded exception to per-feature colocation, so future rewording is a
  one-place change). Colors stay per-feature (presentation, not vocabulary).
- Consumers migrated: History (helpers + filter options), AnimeDetail
  (helpers), Catalog (filter options), Chapters (state labels + state
  options, replacing the English set).
- Docs sweep + `autoreas-theme` skill entry.

## Out of scope

- Backend (Go carries the raw int only — no label mapping exists there).
- Tipo labels (already verified/correct), activo labels, colors.

## Reference

Full analysis: `openspec/changes/2026-07-05-sdd-39-season-selection-program/`
(explore.md §4, slices/sdd-40-estado-labels.md).
