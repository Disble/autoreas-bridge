# Delta for Anime Editor

## ADDED Requirements

### Requirement: Library empty-state truth and recovery

After the Library source has resolved, the system MUST classify an empty Library as actual-empty only when the source collection has no anime. It MUST classify a non-empty source collection with zero visible results as search/filter-empty only when an active search or Library filter produced those zero visible results. Actual-empty MUST state that the Library is empty and provide a **Create an anime** action to `/editor/create`; it MUST NOT provide **Clear search and filters**. Search/filter-empty MUST state that the active search or filters produced no matches, MUST NOT claim that the Library is empty, MUST provide **Clear search and filters** that restores the Library defaults, and MUST NOT provide **Create an anime**.

#### Scenario: Actual-empty Library starts creation

- GIVEN the Library source has resolved with zero anime
- WHEN the Library renders
- THEN its Airis state accurately describes an empty Library
- AND activating **Create an anime** navigates to `/editor/create`
- AND **Clear search and filters** is absent

#### Scenario: Search or filter yields zero matches

- GIVEN the resolved Library source contains anime
- AND an active search or Library filter yields zero visible anime
- WHEN the Library renders
- THEN its Airis state describes zero matches for the current criteria
- AND activating **Clear search and filters** restores the default criteria
- AND **Create an anime** is absent

#### Scenario: No active criteria does not imply search/filter-empty

- GIVEN the resolved Library source contains anime
- AND no search or Library filter is active
- WHEN the visible-result count is evaluated
- THEN zero visible results alone MUST NOT classify the Library as search/filter-empty

#### Scenario: Library loading is not empty

- GIVEN the Library request has not resolved
- WHEN the Library renders
- THEN loading feedback remains visible
- AND neither Library Airis state is rendered
