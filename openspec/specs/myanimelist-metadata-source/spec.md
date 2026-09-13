# MyAnimeList Metadata Source Specification

## Purpose

Provide an isolated module that retrieves anime metadata from MyAnimeList in two stages — a
typo-tolerant search and a confirmed-candidate detail fetch — and returns it in MAL's own
vocabulary. The module has no knowledge of the anime editor's domain vocabulary.

## Requirements

### Requirement: Two-stage retrieval gates the detail fetch on confirmation

The module MUST expose a search stage that returns candidate cards without fetching any anime
detail page, and a separate detail stage. The detail stage MUST only run when the caller supplies
an explicitly confirmed candidate id.

#### Scenario: Search returns candidates without fetching a detail page

- GIVEN a search keyword
- WHEN the search stage runs
- THEN it returns candidate cards (id, name, image, media type, start year, score)
- AND no anime detail page is fetched

#### Scenario: Detail stage requires an explicit candidate id

- GIVEN no candidate has been confirmed
- WHEN the caller has not supplied a confirmed candidate id
- THEN the detail stage MUST NOT be invoked

#### Scenario: Zero search results is not an error

- GIVEN a keyword that matches nothing
- WHEN the search stage runs
- THEN it returns an empty candidate set
- AND this MUST NOT be reported as an error

### Requirement: Required-anchor parsing aborts loudly; optional fields degrade visibly

The detail parser MUST treat the title heading, `Type:`, and `Status:` as required anchors. If any
required anchor is absent, the parser MUST return a typed error naming the missing anchor and abort
the fetch with no partial result. Absence of any other, optional field MUST leave that field empty
in the result and MUST be reported as unfilled — never silently defaulted.

#### Scenario: Missing required anchor aborts with a typed, named error

- GIVEN a detail page missing the `Status:` anchor
- WHEN the parser runs
- THEN it returns a typed error naming `Status:` as the missing anchor
- AND no metadata result is returned

#### Scenario: Missing optional field is reported, not defaulted

- GIVEN a detail page with all required anchors present but no `Studios:` field
- WHEN the parser runs
- THEN the result's studios value is empty
- AND the result marks studios as unfilled

### Requirement: Genre label matches both singular and plural forms

The parser MUST match the genre label whether it appears as `Genres:` (several values) or `Genre:`
(exactly one), and MUST NOT return an empty genre list solely because the singular form was used.

#### Scenario: Single-genre anime still yields a genre

- GIVEN a detail page using the singular `Genre:` label with one value
- WHEN the parser runs
- THEN the result contains that one genre

#### Scenario: Multi-genre anime still yields all genres

- GIVEN a detail page using the plural `Genres:` label with several values
- WHEN the parser runs
- THEN the result contains every listed genre

### Requirement: Duration parsing recognizes known shapes, rejects unknown ones as drift

The parser MUST recognize at least the `N min. per ep.` and `H hr. M min.` duration shapes. A
duration string matching neither known shape MUST be reported as a typed parse-drift error for that
field, and MUST NOT be reported as a zero or empty duration.

#### Scenario: Per-episode duration is parsed to its minute value

- GIVEN a detail page with `Duration: 24 min. per ep.`
- WHEN the parser runs
- THEN the result carries a per-episode duration of 24 minutes

#### Scenario: Hour-and-minute duration is parsed to its total minute value

- GIVEN a detail page with `Duration: 1 hr. 46 min.`
- WHEN the parser runs
- THEN the result carries a duration of 106 minutes
- AND the hour component is not dropped

#### Scenario: Unrecognized duration shape is a drift error, not a zero

- GIVEN a detail page with a duration string matching neither known shape
- WHEN the parser runs
- THEN the result reports a typed parse-drift error for duration
- AND duration MUST NOT be reported as zero or empty

### Requirement: Source label handles anchor text, bare text, and padding

The parser MUST extract the `Source:` value whether rendered as anchor text or bare text, and MUST
trim surrounding whitespace and newlines from the extracted value.

#### Scenario: Anchor-rendered source is extracted and trimmed

- GIVEN a detail page where `Source:` is an anchor whose text is padded with newlines
- WHEN the parser runs
- THEN the result's source value has no leading or trailing whitespace

#### Scenario: Bare-text source is extracted

- GIVEN a detail page where `Source:` is plain text, not an anchor
- WHEN the parser runs
- THEN the result's source value equals that text

### Requirement: Module boundary isolation

`internal/myanimelist` MUST NOT import any package under `internal/anime`.

#### Scenario: Static import boundary holds

- GIVEN the `internal/myanimelist` package tree
- WHEN its imports are inspected
- THEN none of them resolve to `internal/anime` or any of its subpackages
