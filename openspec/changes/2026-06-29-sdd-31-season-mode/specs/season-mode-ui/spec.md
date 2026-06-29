# Season Mode UI Specification

## Purpose

Defines the frontend surface for season mode: the `/preferences` route, "Opciones" nav entry,
`preferences-source.ts` infrastructure adapter, `usePreferencesStore` zustand store,
`SeasonModePanel` dumb component, and the consumer-readable store contract that lets other
sections (including SDD-31b) read the season mode flag without backend rework.

## Requirements

### Requirement: Preferences route is reachable via "Opciones" nav entry

The system MUST expose a `/preferences` route linked from the main navigation under the label
"Opciones".

#### Scenario: Opciones entry is present in navigation
- GIVEN the application is loaded and `AppLayout` renders
- WHEN the user inspects the navigation items
- THEN an "Opciones" entry SHALL be visible and SHALL navigate to `/preferences`

#### Scenario: PreferencesRoute renders without error
- GIVEN the user navigates to `/preferences`
- WHEN the route renders
- THEN `PreferencesRoute` SHALL render without throwing and SHALL contain `SeasonModePanel`

---

### Requirement: SeasonModePanel reflects persisted season mode state on load

The system MUST display the persisted season mode value as a toggle (Desactivado/Activado)
when `SeasonModePanel` is mounted.

#### Scenario: Panel displays Activado when season mode is true
- GIVEN `GetSeasonMode()` returns `true`
- WHEN `SeasonModePanel` is rendered
- THEN the toggle SHALL display "Activado"

#### Scenario: Panel displays Desactivado when season mode is false or unset
- GIVEN `GetSeasonMode()` returns `false`
- WHEN `SeasonModePanel` is rendered
- THEN the toggle SHALL display "Desactivado"

---

### Requirement: usePreferencesStore loads season mode exactly once on route mount

`usePreferencesStore` MUST call `GetSeasonMode()` exactly once when the preferences route first
mounts. It MUST NOT cause layout shift or trigger a duplicate fetch on remount.

#### Scenario: Store loads on first mount
- GIVEN the preferences route has not been mounted in this session
- WHEN the route mounts
- THEN `GetSeasonMode()` SHALL be called exactly once and the store SHALL reflect the returned value

#### Scenario: Already-loaded store does not refetch on remount
- GIVEN `usePreferencesStore` has already completed its initial load
- WHEN the user navigates away from and back to `/preferences`
- THEN `GetSeasonMode()` SHALL NOT be called again

---

### Requirement: Toggling season mode round-trips through the Wails binding

The system MUST call `SetSeasonMode(enabled)` when the user flips the toggle, update the store
on success, and surface errors without crashing or leaving stale UI state.

#### Scenario: Activating the toggle calls SetSeasonMode(true)
- GIVEN season mode is currently disabled
- WHEN the user activates the toggle in `SeasonModePanel`
- THEN `SetSeasonMode(true)` SHALL be called, the store SHALL update to `true`, and the toggle SHALL display "Activado"

#### Scenario: Deactivating the toggle calls SetSeasonMode(false)
- GIVEN season mode is currently enabled
- WHEN the user deactivates the toggle
- THEN `SetSeasonMode(false)` SHALL be called, the store SHALL update to `false`, and the toggle SHALL display "Desactivado"

#### Scenario: Binding error does not crash the UI
- GIVEN `SetSeasonMode` returns a non-empty error string
- WHEN the user flips the toggle
- THEN the UI SHALL NOT crash and the toggle SHALL revert to the value before the toggle attempt

---

### Requirement: Persisted season mode value is shown after a full app reload

The system MUST restore the last persisted season mode state when the app restarts and the user
navigates to `/preferences`.

#### Scenario: Enabled value visible after reload
- GIVEN season mode was set to `true` in a prior session
- WHEN the app restarts and the user navigates to `/preferences`
- THEN `SeasonModePanel` SHALL display "Activado"

#### Scenario: Disabled value visible after reload
- GIVEN season mode was set to `false` (or never set) in a prior session
- WHEN the app restarts and the user navigates to `/preferences`
- THEN `SeasonModePanel` SHALL display "Desactivado"

---

### Requirement: Season mode is readable by other sections via a store selector

`usePreferencesStore` MUST expose a stable selector for the current season mode value. Any
section (including future SDD-31b consumers) SHALL read season mode through this selector
without invoking Wails bindings directly.

#### Scenario: Consumer reads true from loaded store
- GIVEN `usePreferencesStore` has loaded and season mode is `true`
- WHEN another section calls the season mode selector
- THEN it SHALL receive `true` without making a new Wails binding call

#### Scenario: Consumer receives safe default before store loads
- GIVEN `usePreferencesStore` has not yet completed its initial load
- WHEN a consumer section reads the season mode selector
- THEN it SHALL receive `false` (safe default) and SHALL NOT throw

---

### Requirement: SeasonModePanel is dumb UI — no Wails calls, no useEffect, no business logic

`SeasonModePanel` MUST be a presentational component (HeroUI v3 + Tailwind) that receives its
state and callbacks as props. All load/toggle logic MUST live in a colocated `use-*.ts` hook.

#### Scenario: Panel receives season mode state via props
- GIVEN the hook computes the current season mode value and toggle handler
- WHEN `SeasonModePanel` renders
- THEN it SHALL derive display state entirely from props and SHALL NOT call any Wails binding
  or read any store directly

#### Scenario: Panel renders helper text regardless of toggle state
- GIVEN `SeasonModePanel` is rendered in either state
- WHEN the component mounts
- THEN the helper text "Ver animes se abre con la sección de Estrenos desplegada en Ver hoy."
  SHALL be visible below the toggle
