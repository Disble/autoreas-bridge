# Delta for Loading Skeletons

## MODIFIED Requirements

### Requirement: Shape-mirroring loading placeholders

While any surface's request is unresolved, the system MUST render placeholder content in place of the
content that will replace it, and MUST NOT render a bare sentence or a lone spinner as the only
loading feedback. A surface whose resolved content is a list or a table MUST render more than one
placeholder row. A surface whose resolved content is a single composition MAY render one placeholder
matching that composition's shape.

(Previously: the requirement named only Today, the Editor Library and Catalog.)

#### Scenario: No surface answers an unresolved request with a sentence

- GIVEN any surface in the application has an unresolved request
- WHEN it renders its loading branch
- THEN placeholder content is present
- AND no loading sentence is the only feedback shown

#### Scenario: A table keeps its header while loading

- GIVEN a table-backed surface has an unresolved request
- WHEN it renders
- THEN its column headers are present
- AND its body holds placeholder rows rather than a loading message

#### Scenario: Placeholders disappear once the request resolves

- GIVEN a surface has resolved, with content or with none
- WHEN it renders
- THEN no placeholder is present

#### Scenario: A placeholder replaces the content rather than joining it

- GIVEN a surface has previously resolved content
- AND a further request for that surface is unresolved
- WHEN it renders
- THEN placeholder content is present
- AND none of the previously resolved content is present

### Requirement: Loading is announced, not merely drawn

Every surface MUST expose, while loading, a region with role `status` whose accessible name states
what is loading, and MUST remove it once the request settles. A static `aria-label` on a landmark does
not satisfy this: a screen reader surfaces that on landmark navigation rather than when loading
begins. Where table markup forbids nesting the region, the surface MUST place it adjacent to the table
and mark the table busy while loading.

(Previously: the requirement named only the three original surfaces.)

#### Scenario: Every loading surface exposes a named status region

- GIVEN any surface is loading
- WHEN its accessibility tree is inspected
- THEN a region with role `status` is present
- AND its accessible name states what is loading

#### Scenario: A landmark label is not an announcement

- GIVEN a surface renders skeleton bars
- WHEN its loading branch is inspected
- THEN it exposes a status region
- AND it does not rely on a `<section>` `aria-label` as its only loading signal

#### Scenario: A loading table is marked busy

- GIVEN a table-backed surface is loading
- WHEN its accessibility tree is inspected
- THEN the table is marked busy
- AND an adjacent status region names what is loading

## ADDED Requirements

### Requirement: One shared placeholder for uniform bar skeletons

Surfaces whose placeholder is a stack of uniform bars MUST use one shared component rather than
repeating the markup, and that component MUST carry the status region so no adopting surface can
render bars without an announcement.

#### Scenario: Uniform bar skeletons share one implementation

- GIVEN a surface's placeholder is a stack of uniform full-width bars
- WHEN it renders its loading branch
- THEN it renders the shared bar placeholder
- AND it does not hand-roll its own stack of bars

#### Scenario: The shared placeholder cannot be used without announcing

- GIVEN the shared bar placeholder renders
- WHEN its accessibility tree is inspected
- THEN a region with role `status` is present, named by the caller-supplied wording
