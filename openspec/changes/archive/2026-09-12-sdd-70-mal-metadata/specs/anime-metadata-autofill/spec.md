# Anime Metadata Autofill Specification

## Purpose

Let a user fill a Create row or an Edit form from MyAnimeList with one action: search, review
candidates, confirm exactly one, and apply only the mapped, form-owned fields to the draft.
Nothing is written until the user confirms.

## Requirements

### Requirement: Fetch-metadata action availability

A **Fetch metadata** action MUST be available on each Create row card and on the Edit form panel.
It MUST be disabled while the row's/form's Name is empty.

#### Scenario: Action disabled with empty Name

- GIVEN a Create row or Edit form with an empty Name
- WHEN it renders
- THEN the Fetch metadata action is disabled

#### Scenario: Action enabled once Name is present

- GIVEN a Create row or Edit form with a non-empty Name
- WHEN it renders
- THEN the Fetch metadata action is enabled

### Requirement: Lookup modal search behavior

Activating the action MUST open a lookup modal with its own search field, pre-filled from Name only
on the modal's first open. The field MUST refine results as the user types, debounced, with a
minimum query length, dropping any response that is not the newest.

#### Scenario: First open pre-fills from Name

- GIVEN the user activates Fetch metadata with Name "Bleach"
- WHEN the modal opens for the first time
- THEN its search field is pre-filled with "Bleach"

#### Scenario: Typing refines results without applying stale responses

- GIVEN the user types past the minimum query length
- WHEN a later keystroke's response arrives after an earlier keystroke's response
- THEN only the response matching the current search field value is shown

### Requirement: Candidate list renders exactly one of three exclusive states

The candidate list MUST render exactly one of: a shape-mirroring loading skeleton, an empty-result
state, or an error state. The active state MUST replace the prior state's content rather than stack
above it.

#### Scenario: Loading replaces prior candidates

- GIVEN a new search request is in flight
- WHEN the list renders
- THEN the loading skeleton is shown
- AND no candidate cards from a prior search are shown

#### Scenario: Zero candidates shows the empty state, not an error

- GIVEN a search resolves with zero candidates
- WHEN the list renders
- THEN the empty state is shown
- AND neither the skeleton nor an error is shown

#### Scenario: A failed search shows the error state

- GIVEN a search request fails
- WHEN the list renders
- THEN the error state is shown
- AND neither the skeleton nor candidate cards are shown

### Requirement: Candidate list is locally re-scored for presentation order only

The candidate list MUST be reordered by local string-similarity to the typed query before display.
Re-scoring MUST govern presentation order only — it MUST NOT pre-select or auto-confirm any
candidate.

#### Scenario: The closest match to the typed name ranks first

- GIVEN MAL's own ranking places a same-franchise entry above the entry closest to the typed name
- WHEN the candidate list renders
- THEN the entry closest to the typed name appears first

#### Scenario: Re-scoring never auto-selects

- GIVEN the candidate list has been reordered
- WHEN it renders
- THEN no candidate is pre-selected or auto-confirmed

### Requirement: Detail fetch and form writes are gated on explicit confirmation

No anime detail page MUST be fetched, and no field MUST be written to the draft, until the user
confirms a specific candidate. Selecting a candidate card MUST NOT itself write anything.

#### Scenario: Browsing candidates writes nothing

- GIVEN candidates are listed
- WHEN the user selects a candidate card without confirming
- THEN no draft field changes
- AND no detail page is fetched

#### Scenario: Cancel leaves the form unchanged

- GIVEN the lookup modal is open with a candidate selected
- WHEN the user cancels
- THEN the modal closes
- AND the form is byte-identical to before the modal opened

### Requirement: MAL-to-form mapping applies only the mapped, form-owned fields

On confirm, the mapping MUST translate MAL's vocabulary into the form's optional fields: type maps
through the closed four-value enum (Anime/TV, Película, Especial, OVA); genres are read from either
the singular or plural genre label; duration, source, and studios map directly. MAL's `Status:`
(airing status) MUST NOT be written to the form's watching-estado field under any circumstance —
the two are different vocabularies that share a word.

#### Scenario: MAL Status is never written to the watching estado

- GIVEN a confirmed candidate whose MAL status is "Currently Airing"
- WHEN the mapping applies
- THEN the form's watching-estado field is unchanged

#### Scenario: Unmapped media type is left at default and reported unfilled

- GIVEN a confirmed candidate whose MAL type is `ONA` or `Music`
- WHEN the mapping applies
- THEN the form's type field stays at its default value
- AND type is reported as unfilled

#### Scenario: Single-genre candidate fills genres

- GIVEN a confirmed candidate with one genre under the singular label
- WHEN the mapping applies
- THEN the form's genres field contains that genre

### Requirement: Never-touched fields stay untouched

Confirming a candidate MUST NOT alter Download page, Folder, Watched episodes, the watching-estado
field, or the premiere date, on either surface.

#### Scenario: Confirm leaves protected fields untouched

- GIVEN a form with existing values for Download page, Folder, Watched episodes, watching estado,
  and premiere date
- WHEN a candidate is confirmed
- THEN none of those five fields change

### Requirement: Unfilled optional fields are reported, not silently skipped

When a form-owned optional field cannot be filled — because MAL omitted it or its value has no
mapped slot — the applied result MUST report it as unfilled, visible to the user.

#### Scenario: Missing optional MAL field is surfaced

- GIVEN a confirmed candidate whose detail page has no `Studios:` field
- WHEN the mapping applies
- THEN studios stays empty
- AND the user-visible report lists studios as unfilled
