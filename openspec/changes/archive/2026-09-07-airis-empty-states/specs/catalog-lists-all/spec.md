# Delta for Catalog Lists All Animes

## ADDED Requirements

### Requirement: Catalog empty-state truth and recovery

After the Catalog source has resolved, the system MUST classify an empty Catalog as actual-empty only when the source collection has no anime. It MUST classify a non-empty source collection with zero visible results after a search or filter as criteria-empty. Actual-empty MUST state that the Catalog is empty and provide a **Create an anime** action to `/editor/create`; it MUST NOT provide **Clear search and filters**. Criteria-empty MUST describe the current search or filters, MUST NOT claim that the Catalog is empty, MUST provide **Clear search and filters** that restores the all-records default, and MUST NOT provide **Create an anime**.

#### Scenario: Actual-empty Catalog starts creation

- GIVEN the Catalog source has resolved with zero anime
- WHEN Catalog renders
- THEN its Airis state accurately describes an empty Catalog
- AND activating **Create an anime** navigates to `/editor/create`
- AND **Clear search and filters** is absent

#### Scenario: Catalog criteria yield zero matches

- GIVEN the resolved Catalog source contains active or inactive anime
- AND a search or any selected filter yields zero visible anime
- WHEN Catalog renders
- THEN its Airis state describes zero matches for the current criteria
- AND activating **Clear search and filters** restores the all-records default
- AND **Create an anime** is absent

#### Scenario: Catalog loading is not empty

- GIVEN the Catalog request has not resolved
- WHEN Catalog renders
- THEN loading feedback remains visible
- AND neither Catalog Airis state is rendered
