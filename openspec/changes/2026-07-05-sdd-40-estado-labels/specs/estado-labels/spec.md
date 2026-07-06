# Spec — estado-labels

## ADDED Requirements

### Requirement: Canonical estado vocabulary

The frontend SHALL render Legacy anime `estado` values with exactly one
canonical vocabulary: 0="Viendo", 1="Finalizado", 2="No me gusto",
3="En pausa". Unknown values SHALL fall back to the raw number as string.

#### Scenario: estado 2 renders as No me gusto

- **WHEN** any surface (History, Catalog filter, Anime detail, Chapters)
  renders an anime with `estado = 2`
- **THEN** the label shown is "No me gusto" (never "Abandonado" or "Dropped")

#### Scenario: estado 3 renders as En pausa

- **WHEN** any surface renders an anime with `estado = 3`
- **THEN** the label shown is "En pausa" (never "Pendiente" or "Paused")

#### Scenario: unknown estado falls back to raw value

- **WHEN** a surface renders an anime with `estado = 7`
- **THEN** the label shown is "7"

### Requirement: Single global source for the vocabulary

The vocabulary SHALL live in one shared module
(`frontend/src/shared/constants/anime-estado.ts`) consumed by every feature;
no feature SHALL define its own estado label text. Chip/state colors remain
feature-local.

#### Scenario: rewording is a one-place change

- **WHEN** a label in the shared module changes
- **THEN** History, Catalog, Anime detail, and Chapters all render the new
  wording with no other source edits
