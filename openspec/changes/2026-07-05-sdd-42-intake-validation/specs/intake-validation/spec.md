# Spec — intake-validation

## ADDED Requirements

### Requirement: jkanime name search

The system SHALL search anime by name against jkanime's `/buscar/` page and
return each result's title and page URL; a no-results page yields an empty set,
not an error.

#### Scenario: franchise search returns every entry

- **WHEN** searching "dr stone"
- **THEN** the Dr. Stone franchise entries (base, Science Future Part 3, …) are
  returned with their page URLs

### Requirement: similarity matching with a season-marker guard

The system SHALL classify an intake name against candidates as matched (a clear
winner whose season/part markers match the query), ambiguous (ranked
candidates), or not_found.

#### Scenario: exact match with a clear winner

- **WHEN** resolving "Dr. Stone: Science Future Part 3" against the franchise
- **THEN** the status is matched and the Part 3 page is selected

#### Scenario: season/part mismatch is not auto-matched

- **WHEN** the query wants Part 3 but only Part 2 exists
- **THEN** it is not auto-matched (ambiguous, kept for the user to decide)

### Requirement: living intake list with resolution

Intake names SHALL be importable as a plain-text list (one per line, trimmed,
de-duplicated), re-importable to add new names, and each row SHALL be resolvable
to a page URL (candidate pick or pasted URL) or discarded.

#### Scenario: import parses, dedupes, and skips blanks

- **WHEN** importing a list with blank lines and a duplicate name
- **THEN** one pending row per unique name is created

#### Scenario: manual resolution and discard

- **WHEN** the user resolves a row to a URL or discards a row
- **THEN** the row status becomes matched (with that URL) or discarded

### Requirement: Intake & Matching workspace section

The Season Workspace SHALL expose an "Intake & Matching" section to paste the
list, run matching, and resolve/discard rows, reflecting each row's match status.

#### Scenario: run matching updates statuses

- **WHEN** the user runs matching on imported rows
- **THEN** each row shows matched / ambiguous / not_found with its candidates
