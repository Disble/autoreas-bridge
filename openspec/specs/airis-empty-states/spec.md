# Airis Empty States Specification

## Purpose

Provide a shared, accessible visual treatment for resolved empty results on Today, Editor Library, and Catalog.

## Requirements

### Requirement: Surface-specific Airis presentation

The system MUST provide one presentation-only `AirisEmptyState` that accepts surface-owned text and an optional action. Today, Editor Library, and Catalog MUST each use a distinct Airis composition derived from the supplied master artwork. Each composition MUST be a transparent 512×512 WebP source asset imported by the application.

#### Scenario: Each scoped surface receives its own artwork

- GIVEN Today, Editor Library, and Catalog each have a resolved empty state
- WHEN their empty presentations render
- THEN each renders its assigned, distinct Airis asset
- AND no fourth surface receives an Airis empty state from this change

#### Scenario: Asset is decorative and sized predictably

- GIVEN an Airis empty presentation renders
- WHEN its image is inspected
- THEN it MUST expose intrinsic width and height of 512 with `alt=""` and `aria-hidden="true"`
- AND it MUST use eager loading and asynchronous decoding

### Requirement: Empty-state exclusivity and accessible actions

AirisEmptyState MUST render only for a resolved empty result. It MUST NOT render during loading or error states. A supplied action MUST render as a button with the exact accessible name supplied for that action.

#### Scenario: Loading and error take precedence

- GIVEN a scoped surface is loading or has an error
- WHEN it renders
- THEN its loading or error feedback is visible
- AND no Airis image or empty-state action is present

#### Scenario: Resolved non-empty results take precedence

- GIVEN a scoped surface has resolved items
- WHEN it renders
- THEN its normal item content is visible
- AND no Airis empty presentation is present

#### Scenario: Supplied action has a discoverable name

- GIVEN an Airis empty presentation receives an action named **Create an anime**
- WHEN the presentation renders
- THEN the action is exposed with role `button`
- AND its accessible name is exactly **Create an anime**

### Requirement: Today resolved-empty guidance

After Today has resolved and its selected day and lens contain no rows, the system MUST render the Today Airis presentation with Today-specific contextual copy. It MUST provide a **Create an anime** action to `/editor/create` and MUST keep the day controls and lens controls available.

#### Scenario: Empty Today guides creation without hiding controls

- GIVEN Today has resolved with zero rows for the selected day and lens
- WHEN Today renders
- THEN its Airis state identifies the selected day or lens context
- AND activating **Create an anime** navigates to `/editor/create`
- AND day and lens controls remain available

#### Scenario: Today loading or error does not become empty guidance

- GIVEN Today is loading or has an error
- WHEN Today renders
- THEN its loading or error feedback remains visible
- AND no Today Airis state or **Create an anime** action is present
