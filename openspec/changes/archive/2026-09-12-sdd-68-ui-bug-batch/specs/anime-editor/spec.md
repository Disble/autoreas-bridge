# Delta for Anime Editor

## MODIFIED Requirements

### Requirement: General form scope and lifecycle separation

The general editor MUST edit only the fields allowed by the authoritative editor contract,
MUST validate that contract before any write, and MUST NOT expose `_id`, `modified_at`,
`repetir`, or `primeravez` as general editable fields. Lifecycle history MUST remain outside
the general form. Repeat and Restore MUST be exposed as lifecycle actions inside the general
form. Their visibility and confirmation-before-write rules are INHERITED from the
`anime-update-repeat-restore` capability's "Action visibility" and "Confirmation prevents
accidental writes" requirements; this requirement does not redefine those rules, it exposes
the two actions on this surface and defers to that capability for when they show and how they
confirm. `activo=false` MUST be presented as **Deactivate anime** and MUST represent
deactivation, not deletion.
(Previously: Repeat, Restore, and lifecycle history were all excluded from the general form;
only Deactivate lived inside it.)

#### Scenario: Lifecycle history stays outside the general form; Repeat and Restore live inside it

- GIVEN the user opens Anime Editor for an eligible anime
- WHEN the form renders
- THEN Repeat and Restore render as actions inside the general form, subject to the inherited
  `anime-update-repeat-restore` visibility and confirmation rules
- AND lifecycle history is not part of the general editable field set
- AND `_id`, `modified_at`, `repetir`, and `primeravez` still cannot be changed through the
  general form

#### Scenario: Deactivation uses accurate semantics

- GIVEN the user chooses **Deactivate anime**
- WHEN the change is saved successfully
- THEN the anime becomes inactive through `activo=false`
- AND the record is not treated as deleted or tombstoned

#### Scenario: The general form honors the inherited visibility gate

- GIVEN an anime that is active (`activo=true`) and unfinished (`estado=0`)
- WHEN the general form renders
- THEN neither Repeat nor Restore renders in the general form
- AND only the actions eligible under the inherited `anime-update-repeat-restore` visibility
  rule are shown

#### Scenario: Restore requires confirmation before any write

- GIVEN the user opens Anime Editor for an inactive anime (`activo=false`)
- WHEN the user activates **Restore**
- THEN a confirmation prompt opens before any gateway call
- AND the anime stays inactive until the user confirms

#### Scenario: Repeat requires confirmation before any write

- GIVEN the user opens Anime Editor for a finished anime (`estado > 0`)
- WHEN the user activates **Repeat**
- THEN a confirmation prompt opens before any gateway call
- AND the anime's watch state is unchanged until the user confirms

#### Scenario: Cancelling a lifecycle confirmation performs no write

- GIVEN a Repeat or Restore confirmation is open
- WHEN the user cancels it
- THEN no gateway call occurs
- AND the anime's lifecycle state is unchanged

#### Scenario: Deactivate keeps its existing label and confirmation

- GIVEN the user opens Anime Editor for an active anime
- WHEN the user activates **Deactivate anime**
- THEN the button label remains **Deactivate anime**
- AND a confirmation prompt opens before any gateway call, unchanged from current behavior

## UI Structure (mockup update — not a requirement, for the archive step to carry over)

The action-area row in the main spec's `## UI Structure` mockup (currently
`| [Deactivate anime] [Discard changes] [Save]    |`) MUST be updated to show Repeat
alongside the mutually exclusive Deactivate/Restore button:

```text
|                               | [Repeat] [Deactivate anime | Restore]          |
|                               | [Discard changes] [Save]                       |
```

`[Deactivate anime | Restore]` denotes the same mutually exclusive slot as today — Deactivate
when active, Restore when `activo=false`. `[Repeat]` is independently gated on `estado > 0`
and can appear alongside either.
