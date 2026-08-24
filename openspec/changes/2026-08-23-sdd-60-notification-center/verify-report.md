# Verify Report — Notification Center (SDD-60)

### Verdict

REJECTED

Rejected by the user on 2026-08-24 during hands-on verification of the running build. An earlier
agent-run pass on this same change reported PASS; that verdict was wrong and is superseded here, not
deleted — the reasoning that produced it is recorded in §6 because the failure mode is reusable.

The change is **not archived**. Archive commit `8dbc73d` has been reverted: the delta specs are deltas
again and the change folder is active again. It archives when the hotfix slice below passes, not before.

---

## 1. Why it was rejected

The user opened the built app and could not do the one thing the feature exists for.

> *"el principal es que no puedo ver el detalle de ninguna notificación. El siguiente es que la tabla
> no se actualiza en tiempo real."*

Both are true, and neither was caught by 1 767 frontend tests, 43 green Go packages, or a
scenario-by-scenario walk of the spec.

### R-1 · The detail pane is never mounted — BLOCKING

`NotificationDetail` has **zero production importers**. `NotificationCenterPanel.tsx:40-48` renders the
filter bar, the selection bar and the table, and stops. There is no row-press handler, no selected-record
state, and nothing that renders a detail. The user cannot open any notification because there is nothing
to open.

Everything downstream of it is unreachable with it:

- `useNotificationAction` → `ExecuteNotificationAction` — the entire PendingIntent press path, which is
  Sequence 2 of the design canvas, the sequence the artboard itself calls one of "the two sequences that
  decide the design".
- `use-notification-detail-covers`, `NotificationDetailRow`, `NotificationDetailRows`,
  `NotificationDetailHeader`.

Seven test files cover this code. All of them render the components directly with props, so all of them
stay green whether the component is mounted by the app or by nobody.

### R-2 · The master list never updates live — BLOCKING

`use-notification-center-sync.ts:95-97` fetches on mount and refetches when the filters change or after a
bulk mutation commits. It **never subscribes to `notification.push`**.

The nav badge does subscribe (`use-notifications-nav-badge.ts:26-30`). Two consumers of one event stream,
one of them wired. That is exactly what the user's screenshots show: **badge 2, table 1 row.** The app
contradicts itself on screen.

### R-3 · The unread badge only ever counts up — BLOCKING, and it fails a merged spec scenario

`use-notifications-nav-badge.ts` fetches the count once on mount and increments on every push. Nothing
decrements it. Marking a record read leaves the badge where it was.

`openspec/specs/desktop-navigation/spec.md` (as merged by the archive that is now reverted) carries:

> **Scenario: The badge count updates as records are read** — GIVEN the Notifications nav item shows a
> badge with an unread count of N, WHEN a notification record is marked read, THEN the badge's count MUST
> reflect the new unread count (N-1, or no badge at all if it reaches zero) without requiring a full page
> reload.

Not implemented, not tested. **The previous verify report's claim of 61/61 scenarios satisfied is false.**

### R-4 · The badge is invisible in the rail's resting state

`AppLayout.tsx:76-79` mounts the badge inside a `<span>` carrying `opacity-0` with
`group-hover/rail:opacity-100`. The rail rests collapsed at `md:w-16`. A count badge whose entire purpose
is to inform without being asked, that requires a hover to be seen, does not do its job. The user
annotated exactly this:

> *"hay varias notificaciones, pero no se sabe hasta abrir el sidebar"*

### R-5 · The archived view and Restore are unreachable

`RestoreNotifications` exists in Go, is exposed as a binding, and is present on the frontend source. The
panel pins the view: *"Fixed archive view until a later slice wires the active/archived toggle onto the
panel"* (`use-notification-center-panel.ts:10`). Archiving a record therefore removes it from the only
view the user can reach, with no way back. That later slice never came, and no task tracks it.

---

## 2. The real finding: every defect sits on a seam, and no test crosses a seam

The five failures above are not five unrelated bugs. They are one hole. Each lives precisely at a joint
between two units, and the suite tests units.

The clearest evidence is the one test that had the right name for the job.
`frontend/src/app/routes/__tests__/NotificationsRoute.test.tsx:5-7`:

```tsx
vi.mock('.../NotificationCenterPanel/NotificationCenterPanel', () => ({
  NotificationCenterPanel: () => <div>notification center panel</div>,
}));
```

The route-level test stubs out the panel and then asserts that a `<div>` rendered. It is a unit test
wearing an integration test's filename. Nothing in the repository mounts the real route over the real
panel over the real table.

The user stated the standard this change is now held to:

> *"hiciste un artifact con los workflows, debe haber un test de integracion o e2e por cada ruta de esos
> workflows"*

That is the correct acceptance boundary, and it is now a requirement of this change.

### Coverage of the canvas workflows, per route

**`Flow.dc.html` — producer → port → center → dispatcher → channels → SQLite → `/notifications`**

| Route | Integration/E2E coverage | Verdict |
|---|---|---|
| producer → persist → project (incl. failed write) | `service_test.go`, real SQLite | covered |
| persist → read back through the binding | `app_notification_center_bindings_test.go` | covered (Go side) |
| push arrives → the table shows it | **none** | **R-2** |

**`Lifecycle.dc.html` — the three verbs**

| Route | Coverage | Verdict |
|---|---|---|
| unread → read, by hand | Go covered; no UI-level test | partial |
| unread → read, by opening the detail | **none** | **R-1 — no detail exists** |
| read → unread ("mark unread") | **none** | not implemented anywhere (see §4) |
| dismissed | **none** | not implemented anywhere (see §4) |
| archive → restore | Go covered; UI unreachable | **R-5** |
| record read → badge decrements | **none** | **R-3** |

**`Intents.dc.html` / `Sequences.dc.html` §2 — pressing an action days later**

| Route | Coverage | Verdict |
|---|---|---|
| registry → token → resolve on press | `executor_test.go`, `app_notification_center_intents_test.go` | covered (Go side) |
| detail row button → `ExecuteNotificationAction` | 7 unit files, 0 integration | **R-1 — unreachable** |
| toast → `persistedId` → open the matching record | **none**; `persistedId` survives only in comments | **no per-record route exists** |

---

## 3. What is genuinely sound

Rejecting the change does not mean nothing works. The backend is in good shape and the rejection is
confined to the composition layer.

| Claim | Evidence | Result |
|---|---|---|
| Persist-then-ALWAYS-project | `TestServiceNotifyPersistFailureStillDispatches` forces a real write failure against a schema-less DB | holds |
| `internal/notification` gains no import | `go list -deps` | only `internal/logger` |
| `center` never imports `internal/download` | boundary test | holds |
| `centerschema` imports only `internal/persistence` | boundary test | holds |
| `download.retry_run` is unregistrable | dedicated test | holds |
| No REST/WS surface touched | `git diff main..HEAD -- docs/openapi.yaml openspec/specs/mobile-sync-contract/` | empty |
| Go suite | `go test ./... -count=1` | 43 packages, 0 FAIL |
| Frontend suite | `vitest run` | 1 767 passed / 211 files |

Every one of these is a statement about a unit or a boundary. Not one is a statement about the product.

## 4. Design scope that never reached the spec

Recorded, not being fixed by this hotfix unless the user says otherwise. These are absent from the spec
entirely, so they cannot fail verification — but they were designed on the canvas and dropping them
silently is how R-1 happened in the first place.

- **Dismiss** — `Lifecycle.dc.html` treats dismissal as a layer with its own timestamp precisely so a
  record can be dismissed and still unread. No Go method, no column, no scenario.
- **Mark unread** — the same artboard promises read is *"Reversible — 'mark unread' puts it back"*. No
  implementation in Go or TypeScript, no scenario.
- **`NotificationRow.ActionCount` is always 0** in list rows; `GetNotification` reports the true count.
  A test pins the zero, so changing it must be deliberate.
- **Source and Level filter controls** are absent from the UI. The backend filters are wired and tested
  (`TestListSourcesEmptySliceMatchesEverything` pins empty-slice = match-everything). Absent beats inert.

## 5. Tooling defects found during this change

- **The repo's own SDD gate never validated this change.** `tools/checksdd` resolves the active change
  from `.atl/active-sdd-change`, which reads `2026-07-31-sdd-59-backup-import` — a finished change with
  zero unchecked tasks and a PASS verdict. All 13 commits passed `sdd-gate` by re-validating sdd-59.
  Note the consequence for this hotfix: pointing the marker at SDD-60 now would make `checksdd` fail on
  every commit (unchecked tasks + a REJECTED verdict), blocking the very work that fixes the rejection.
  The marker stays where it is for the duration; the underlying condition is a backlog of 41 unarchived
  change folders and needs its own change.
- **`tools/mutationstaged`** blew its 10-minute `harnessTimeout` on slices 1, 2b and 5. Its `computeScope`
  also collapses N independent whole-file ranges into a single `[0, largest-file-length)` when several
  new files are staged together, silently widening the scope to whole files.
- **`react-doctor` honors no path exclusion** (`ignores`, `ignorePatterns`, `exclude`, `excludePatterns`
  all tried). Resolved by untracking `frontend/wailsjs/` behind a postinstall hook — safe because
  `wails generate module` owns that directory (`build.go:131-136`; `base.go:436-437` does `os.RemoveAll`).
  The hook verifies its outputs exist because that command **exits 0 even when it fails**. Written up in
  `docs/reports/dharness-generated-code-exclusion.md`.
- **`vitest`'s `maxWorkers` had been benchmarked standalone.** The gate runs `frontend-heavy` beside
  `go-heavy` and `dharness`; at 8 workers four integration tests starved past the 5s per-test budget and
  failed **only inside the hook**. One contention problem with four symptoms. Restored to 4.

## 6. Why the first verify pass said PASS

Kept deliberately. The method failed in a specific, repeatable way, and naming it is worth more than
quietly replacing the verdict.

The pass walked the 61 spec scenarios and asked, for each: *does code exist that satisfies this?* For all
61 the answer was yes. It never asked the second question: *can a user reach it?* A spec describes the
shape of a thing; it does not describe the path to it. `notification-center` specifies the detail block as
*"exactly one bounded row-list block"* and never says how a user opens one — so an unmounted component
satisfied it perfectly.

Three signals were present and each was read as informational rather than as a failure:

1. **`Dismiss` was already found designed-but-unbuilt** and filed as a documented gap because no scenario
   demanded it. The right conclusion was that the spec was an incomplete oracle. The conclusion drawn was
   that the gap was acceptable.
2. **`NotificationRow.ActionCount` is always 0.** A list that cannot say whether a row has actions is a
   list nobody is expected to press. That was recorded as a curiosity.
3. **`use-notification-center-panel.ts:10` says "until a later slice wires the active/archived toggle."**
   A comment naming a slice that does not exist is an unfinished seam, and it was read as a note.

What would have caught it, in one line: **no test in the repository renders the real route over the real
panel.** A single integration test at that seam fails on R-1 and R-2 immediately. Unit coverage cannot
substitute, because a component with perfect unit tests and zero importers is indistinguishable from a
wired one — which is precisely the state this change shipped in.

## 7. Exit condition

This change is verifiable again when the hotfix slice in `tasks.md` is complete: R-1 through R-5 fixed,
each behind an integration test that fails today, plus one integration test per workflow route in the
table in §2. Backend claims in §3 are already proven and are not re-litigated.
