# Download UI Specification

## Purpose

Defines the dumb-UI `download` frontend feature: hoster-priority editor, JD config with live status, schedule panel, run history, and manual trigger — under the project's strict frontend constraints. User-facing toast notifications are NOT part of this feature: they are delivered by the SHARED app-shell toast surface (see the `notifications` capability), which the download backend feeds through the shared `Notifier` port.

## Requirements

### Requirement: Hoster Priority Editor

The frontend MUST expose a hoster-priority editor that reads and persists ordering via Wails-bound calls, with all Wails calls and derived state contained in colocated `use-*.ts` hooks, not in `.tsx` files. The primary reordering interaction MUST be drag & drop, and it MUST provide an equivalent keyboard-accessible reordering path so the editor is usable without a pointer.

#### Scenario: User reorders hosters by drag and drop
- GIVEN the hoster priority editor is displaying the current order
- WHEN the user drags a hoster row to a new position and drops it
- THEN the list MUST visually reflect the new order during and after the drag
- AND the component MUST call the colocated hook's persist function
- AND the hook (not the `.tsx` component) MUST perform the Wails-bound `SetHosterPriority` call with the new order

#### Scenario: User reorders hosters via keyboard
- GIVEN the hoster priority editor is displaying the current order
- WHEN the user moves a focused hoster row up or down using the keyboard
- THEN the list MUST reorder identically to the drag-and-drop path
- AND the same colocated hook persist function MUST be invoked

#### Scenario: Reorder is announced to assistive technology
- GIVEN the user reorders a hoster (by pointer or keyboard)
- WHEN the order changes
- THEN the change MUST be exposed to assistive technology (e.g. an ARIA live announcement of the moved item's new position)

### Requirement: JD Config Panel With Write-Only Password

The frontend MUST expose a JDownloader config panel where the password field is write-only: submitted on save, never pre-filled or displayed from a prior value.

#### Scenario: Opening config panel with existing credentials
- GIVEN JD config was previously saved
- WHEN the user opens the config panel
- THEN the password field MUST render empty, never the previous value (even masked-but-decryptable)

#### Scenario: Saving without changing the password
- GIVEN the user opens the config panel and changes only the email field
- WHEN the user saves without entering a new password
- THEN the system MUST NOT overwrite the stored password with an empty value

### Requirement: JD Live Status Indicator

The frontend MUST display JDownloader's live online/offline status, sourced from a Wails-bound status call or event-bus push, not assumed from `Connect()` success alone.

#### Scenario: JD is online
- GIVEN the backend reports JD status as online (via `ListDevices()`-backed check)
- WHEN the panel renders
- THEN the UI MUST show an "online" indicator

#### Scenario: JD is offline
- GIVEN the backend reports JD status as offline
- WHEN the panel renders
- THEN the UI MUST show an "offline" indicator, not a false "online" state

### Requirement: Schedule Panel

The frontend MUST expose a schedule panel showing enable toggle, cadence/time, next-run, last-run, and last-status, backed by Wails-bound config calls in a colocated hook.

#### Scenario: Schedule state renders
- GIVEN `download_schedule_config` has `enabled=1` and a `next_run_at`
- WHEN the panel mounts
- THEN it MUST display the next run time and the toggle state matching persisted config

### Requirement: Run History Master/Detail

The frontend MUST expose a run-history view listing past `download_runs` rows (master) with a detail view per selected run, including manual links when present.

#### Scenario: Selecting a run shows its detail
- GIVEN a list of past runs is displayed
- WHEN the user selects a run with `status="jd_offline"`
- THEN the detail view MUST display that run's persisted manual download links

### Requirement: Manual Trigger Button

The frontend MUST expose a manual-trigger control that calls the backend trigger binding and reflects loading/last-result state.

#### Scenario: User triggers a run manually
- GIVEN no run is currently in progress
- WHEN the user clicks the manual trigger button
- THEN the UI MUST show a loading state until the run starts/completes
- AND MUST reflect the resulting status once available

#### Scenario: Trigger attempted while a run is already in progress
- GIVEN a run is already in progress
- WHEN the user clicks the manual trigger button
- THEN the UI MUST surface that a run is already active rather than silently failing or double-triggering

### Requirement: Structural Constraints Compliance

Every component under `frontend/src/features/download/` MUST comply with the project's dumb-`.tsx`, strict hook anatomy, colocation, readonly-props, and JSDoc-on-helpers rules.

#### Scenario: Props are readonly
- GIVEN a `*Props` interface defined in a `*.types.ts` file under this feature
- WHEN the interface is reviewed
- THEN every property MUST be declared `readonly`

#### Scenario: Helpers are documented
- GIVEN a helper function exported from a `*.helpers.ts` file under this feature
- WHEN the helper is reviewed
- THEN it MUST have a JSDoc comment

### Requirement: Modern 2026 Design-Pattern Quality Bar

Every UI surface introduced or touched by this change (the `download` feature panels AND the shared app-shell toast) MUST follow current, high-level design-pattern conventions appropriate for 2026, built on HeroUI v3 + Tailwind primitives rather than ad-hoc styling. This is a quality bar applied in addition to the structural constraints below.

#### Scenario: Surfaces use the design system, not bespoke styling
- GIVEN any component introduced by this change
- WHEN it is reviewed
- THEN it MUST compose HeroUI v3 components and design tokens for layout, spacing, color, and typography rather than hand-rolled equivalents
- AND it MUST NOT reintroduce one-off visual patterns that diverge from the existing `dashboard`/`network` feature precedents

#### Scenario: Surfaces handle loading, empty, and error states explicitly
- GIVEN any data-driven panel in this change (run history, JD status, schedule, hoster editor)
- WHEN the underlying data is loading, empty, or in error
- THEN the UI MUST render a deliberate state for each case (skeleton/loading, empty-state, error) rather than a blank or flickering view

#### Scenario: Surfaces are responsive and accessible
- GIVEN any UI surface in this change
- WHEN it is rendered
- THEN interactive elements MUST be keyboard-reachable and labeled for assistive technology
- AND the layout MUST adapt without breaking across the app's supported window sizes

### Requirement: Toasts Are Not Owned by the Download Feature

The `download` feature MUST NOT implement its own toast/notification surface. User-facing notifications MUST be delivered by the shared app-shell toast surface defined in the `notifications` capability; the download feature only triggers them indirectly via the backend `Notifier` port.

#### Scenario: No toast component inside the download feature
- GIVEN the `frontend/src/features/download/` tree
- WHEN it is reviewed
- THEN it MUST NOT contain a toast provider or a `notification.push` listener
- AND any user notifications it causes MUST flow through the shared app-shell toast surface
