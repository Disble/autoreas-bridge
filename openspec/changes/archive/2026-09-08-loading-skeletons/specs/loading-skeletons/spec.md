# Loading Skeletons Specification

## Purpose

Give Today, the Editor Library and Catalog a loading state that shows the shape of the rows about to
arrive, announces itself to assistive technology, and does not move the content when the request
resolves.

## Requirements

### Requirement: Shape-mirroring loading placeholders

While a scoped surface's request is unresolved, the system MUST render placeholder rows that mirror
the structure of the rows that will replace them, and MUST NOT render a bare loading sentence as the
only loading feedback. Each scoped surface MUST render more than one placeholder row, so the
placeholder reads as a list rather than as a single block.

#### Scenario: Today shows schedule-card placeholders

- GIVEN Today's schedule request has not resolved
- WHEN Today renders
- THEN it renders placeholder rows mirroring the episode schedule card
- AND no schedule rows and no empty-state guidance are present

#### Scenario: The Editor Library shows rail-row placeholders

- GIVEN the Library source has not resolved
- WHEN the Library renders
- THEN it renders placeholder rows mirroring the two-line rail row
- AND no anime rows and neither Library empty state are present

#### Scenario: Catalog shows list-row placeholders

- GIVEN the Catalog request has not resolved
- WHEN Catalog renders
- THEN it renders placeholder rows mirroring the catalog list row
- AND no catalog rows and neither Catalog empty state are present

#### Scenario: Placeholders disappear once the request resolves

- GIVEN a scoped surface has resolved, with rows or with none
- WHEN it renders
- THEN no placeholder row is present

### Requirement: Loading is announced, not merely drawn

A placeholder is decorative and carries no accessible name of its own. Each scoped surface MUST
therefore expose, while loading, a status region whose accessible name states what is loading. The
region MUST be removed once the request settles, whether it succeeded or failed. No scoped surface MAY
end up with less assistive-technology signal than it had before its placeholders existed.

#### Scenario: Each loading surface exposes a named status region

- GIVEN a scoped surface is loading
- WHEN its accessibility tree is inspected
- THEN a region with role `status` is present
- AND its accessible name states what is loading

#### Scenario: The status region does not outlive the request

- GIVEN a scoped surface's request has settled
- WHEN its accessibility tree is inspected
- THEN no loading status region is present

#### Scenario: Catalog keeps the announcement it already had

- GIVEN Catalog previously announced loading through a spinner with role `status`
- WHEN Catalog's loading state renders after this change
- THEN a region with role `status` is still present

### Requirement: Loading placeholders do not shift the layout

Preventing the content from jumping when it arrives is the reason a placeholder is preferable to a
spinner, so a placeholder that causes the jump has failed at its purpose. Each scoped surface's
placeholder row MUST occupy the same vertical footprint as the real row it stands in for, within a
stated tolerance, measured in a real browser rather than asserted from markup.

#### Scenario: A placeholder row matches the height of the row it replaces

- GIVEN a scoped surface's placeholder row and its real row are rendered at the same width
- WHEN both are measured in a real browser
- THEN their heights differ by no more than the stated tolerance

#### Scenario: The measurement runs at every checked viewport

- GIVEN the layout gate runs at more than one viewport
- WHEN the placeholder heights are measured
- THEN the match holds at each of them
