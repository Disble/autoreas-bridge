# Notification Actions Specification (PendingIntent Model)

## Purpose

Defines the action-token model that lets a notification record (or any other carrier — a toast, an
existing Wails method, `internal/tray`, a future deep link) hold a declarative, late-bound action that
resolves only when pressed, potentially days later and after a process restart. Modeled directly on
Android's `PendingIntent`, in response to the user's explicit rejection of an earlier "command string
looked up in a registry" shape: *"no veo un design pattern detrás, parece un botón arbitrario que se
quema por cada evento"* ("I don't see a design pattern behind this, it looks like an arbitrary button
burned in per event").

This capability is independently disableable from `notification-center`: an empty `IntentRegistry` is
itself a valid, tested state in which every action refuses with `intent_unregistered` — the Center's
persistence and read model keep working with no live actions at all.

## Requirements

### Requirement: An Action Is A Late-Bound Token, Never Executable Code

A persisted action MUST be represented as `{id, label, intent, args}`, where `intent` is a registry
key (a string identifying a registered operation, e.g. `download.run_anime`) and `args` are frozen at
the moment the record is created — analogous to Android's `PendingIntent.FLAG_IMMUTABLE`. The system
MUST NOT store or evaluate executable code, a shell command, or a URL as an action's payload.

#### Scenario: An action's args cannot be altered after creation

- GIVEN a persisted action with `args` frozen at creation time
- WHEN any code path attempts to change those `args` after the record was created
- THEN the system MUST reject or be structurally incapable of that mutation — the stored `args` at
  press time MUST be byte-identical to the `args` at creation time

#### Scenario: The same token resolves identically from every carrier

- GIVEN one persisted action token referenced both by a Center row and by a toast action
- WHEN either carrier presses it
- THEN both MUST resolve through the same `intent` key and the same frozen `args`, reaching the same
  bound handler with the same result

### Requirement: The IntentRegistry Is Declared By notification/center And Filled By The Composition Root

The `IntentRegistry` interface MUST be declared inside `internal/notification/center`, and concrete
handler registrations (e.g. for `download.run_anime`) MUST come from the composition root (e.g.
`app_notification_center.go`), never from inside `internal/notification/center` itself — this is what
keeps `center` from importing `internal/download` and recreating the proven cycle
(`notification → download → notification`). An unregistered intent key MUST be refused outright; it
MUST NOT be resolved by name, by shell execution, or by URL as a fallback.

#### Scenario: An unregistered intent key is refused, never resolved by name

- GIVEN an action whose `intent` key was never registered
- WHEN that action is pressed
- THEN the system MUST return the `intent_unregistered` refusal
- AND it MUST NOT attempt to resolve the key by name lookup, shell execution, or URL

#### Scenario: An empty registry refuses every action, without crashing

- GIVEN an `IntentRegistry` with zero registered handlers (the disable/kill-switch state)
- WHEN any action is pressed
- THEN every press MUST return `intent_unregistered`
- AND the system MUST NOT panic or crash

### Requirement: Press-Time Validation Follows A Fixed Order And A Closed Refusal Set

Validating a pressed action MUST proceed in exactly this order: (a) does the `actionID` belong to
`THIS` `notificationID`; (b) is the `intent` key registered in the `IntentRegistry`; (c) does the
bound handler accept the frozen `args` against current live state. Any failure at any step MUST
produce ONE of exactly four closed refusal reasons — `intent_unregistered`, `target_missing`,
`already_executed`, `foreign_action` — never an unstructured error, a crash, or a silent no-op. A
refused action MUST render its reason inline and MUST permanently disable its button (it is never
retryable by pressing again).

#### Scenario: An action from a foreign record is refused

- GIVEN an `actionID` that belongs to notification record A
- WHEN it is pressed while framed as belonging to notification record B
- THEN the system MUST return `foreign_action`
- AND it MUST NOT proceed to intent-registry lookup or handler invocation

#### Scenario: An unregistered intent is refused before reaching a handler

- GIVEN an action whose `actionID` correctly belongs to its record, but whose `intent` key is not
  registered
- WHEN it is pressed
- THEN the system MUST return `intent_unregistered`
- AND no handler MUST be invoked

#### Scenario: A deleted target entity is refused, not silently no-op'd, not crashed

- GIVEN a registered, correctly-scoped action whose frozen `args` reference an entity (e.g. an anime)
  that no longer exists
- WHEN it is pressed
- THEN the handler MUST report the target missing
- AND the system MUST return `target_missing`
- AND the row MUST render this refusal inline with its button permanently disabled — it MUST NOT
  appear to have silently done nothing, and MUST NOT crash

#### Scenario: A refusal is always one of exactly four reasons

- GIVEN any pressed action that does not succeed
- WHEN its result is inspected
- THEN its reason MUST be exactly one of `intent_unregistered`, `target_missing`,
  `already_executed`, `foreign_action` — no other value MUST ever be produced

### Requirement: Actions Are Single-Fire By Default, Recorded By `executedAtMs`

Every action MUST store `executedAtMs`, stamped on its first successful execution. A second press of
the SAME action MUST return `already_executed` and MUST NOT re-invoke the handler. There MUST be no
revision counter: frozen `args` plus registry membership plus handler validation already cover every
case a revision number would otherwise be invented for. A specific intent MAY be marked repeatable by
its handler registration; the default for every intent is single-fire.

#### Scenario: A second press of an already-executed action is refused, without re-invoking the handler

- GIVEN an action whose first press succeeded and stamped `executedAtMs`
- WHEN it is pressed a second time
- THEN the system MUST return `already_executed`
- AND the bound handler MUST NOT be invoked a second time

#### Scenario: A first press succeeds and stamps executedAtMs

- GIVEN an action that has never been pressed
- WHEN it is pressed and the handler succeeds
- THEN `executedAtMs` MUST be stamped with the execution time
- AND the action MUST report success, not a refusal

### Requirement: `download.retry_run` Is Not A Registrable Intent

The download service exposes only `RunOnce` (`internal/download/service.go:199`) and `RunAnime`
(`internal/download/service.go:231`) — there is no `RetryRun` (`grep -rn "Retry"
internal/download/` returns zero non-test hits). `download.retry_run` MUST NOT be registered as an
intent key. The equivalent user-facing action MUST be labeled to reflect what actually happens (e.g.
"Run this anime again") and MUST resolve to `download.run_anime`.

#### Scenario: `download.retry_run` is absent from the registry

- GIVEN the fully-wired `IntentRegistry` at runtime
- WHEN its registered keys are inspected
- THEN `download.retry_run` MUST NOT be among them

#### Scenario: A download completion action resolves to `download.run_anime`

- GIVEN a notification whose action label reads "Run this anime again"
- WHEN that action's `intent` key is inspected
- THEN it MUST be `download.run_anime`, not any retry-shaped key

### Requirement: Existing Wails Bindings Become Carriers Of Registered Intents, Not Rival Paths

`RunMissedScheduleNow` (`app_download.go:293-298`) and `IgnoreMissedSchedule`
(`app_download.go:300-306`), already shipped and already called by the existing missed-schedule
toast, MUST become carriers of the SAME registered intents (`schedule.run_missed_now`,
`schedule.ignore_missed`) that an equivalent action token would resolve through — never a second,
independent code path to the same operation.

#### Scenario: The existing binding and an equivalent action token invoke the same handler

- GIVEN `schedule.run_missed_now` is registered in the `IntentRegistry`
- WHEN a user triggers it via the pre-existing `RunMissedScheduleNow` Wails binding, and separately
  via a pressed action token carrying the same intent key and equivalent args
- THEN both MUST invoke the same bound handler
- AND neither MUST bypass the other's validation semantics

### Requirement: A Token's Lifetime Is Its Record's Lifetime, Never A Wall-Clock TTL

An action token MUST NOT expire by wall-clock time. Its only lifetime bound is its owning record's
lifetime: once retention pruning (specified in `notification-center`) deletes the record, that
record's tokens become unreachable — there is nothing left to press, and this is a visible outcome
(the row is gone), not a hidden expiry.

#### Scenario: An action pressed long after creation, with its record still present, resolves normally

- GIVEN an action created many days ago whose owning record has not been pruned
- WHEN it is pressed today
- THEN it MUST be validated and resolved exactly as it would have been the day it was created — no
  elapsed-time check MUST cause a refusal

#### Scenario: A pruned record's actions are simply gone, not expired-and-shown

- GIVEN a record whose actions were never pressed, and the record is later deleted by retention
  pruning
- WHEN the Center is viewed afterward
- THEN that record and its actions MUST no longer be listed at all
- AND there MUST be no separate "this action expired" UI state to reach, because there is no row left
  to display it on
