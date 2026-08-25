# ADR-013: Notification Center boundaries — what counts as a notification

- **Status**: Accepted
- **Date**: 2026-08-25
- **Supersedes**: nothing
- **Implementing change**: `openspec/changes/2026-08-23-sdd-60-notification-center/`
  (SDD-60, in progress)
- **Related**: `.claude/skills/app-notification-pipeline/SKILL.md`

## Context

Bridge already had a transient notification pipeline — a backend
`notification.Notifier` port, a dispatcher, a Windows desktop adapter, and a
HeroUI toast surface. Nothing survived the toast's timeout. A user away from
the machine when a scheduled run failed had no way to learn that it had.

Making notifications durable is the easy half. The half that kept producing
wrong answers is definitional: five different things in this codebase all look
like "a notification" at the producer's call site, and each wants a different
lifetime, vocabulary, and destination. Without a stated rule every producer
decides for itself, and the center fills with routine confirmations until the
warnings are invisible inside it. That failure is not recoverable by tuning —
once the center is noise, users stop opening it.

This ADR records the taxonomy and the noise-control rationale. The schema,
module layout, and delivery mechanics live in the SDD-60 design.

## Decision

### The taxonomy

| Kind | Lifetime | Rule |
|---|---|---|
| **Canonical notification** | Durable | The human should know about this, and may still need to act on it after the toast is gone. Backend-owned, persisted first. |
| **Domain event** | Transient bus traffic | Describes what occurred inside the system. `events.Bus` keeps fanning these out; it does **not** become the notification transport. |
| **Toast** | Seconds | A projection of a committed notification, used to attract attention while the app is open. |
| **Inline feature state** | The current page | Explains the page and is the primary place for remediation. |
| **Observability log line** | Retention policy | Operational evidence for diagnosis, in technical vocabulary. |

Two boundaries carry the load, because both erode silently.

**A toast is not a notification.** It is a projection of one. Closing a toast
does not mark its notification read, archive it, or delete it. The ordering is
fixed the other way round: a user-notable moment is committed before any toast
or desktop projection is attempted, so a persistence failure cannot leave a
visible notification with no durable record behind it.

**Routine mutation feedback stays ephemeral.** "Folder path copied" and
"Preferences saved" remain local toasts. "Download failed after all configured
hosters failed" and "Six scheduled anime need attention" become durable. The
test is whether the user must decide something about it later, not whether the
system did something.

The producing feature decides. Features call the injected `Notifier` directly,
so the decision stays visible at the call site and unit-testable with a fake
notifier — rather than being inferred centrally from event traffic.

The center also does not replace inline state: it can announce that scheduled
anime need attention and link to Downloads, but the per-anime blocker list
stays in Downloads (see ADR-014). And it must never use the observability
event log as its backing store.

### Why deduplication and coalescing exist

A durable store makes repetition permanent. A scheduled run that fails the
same way every night, or a readiness evaluation that reports the same blocker
set on every page open, would otherwise deposit an unbounded pile of identical
records — and each one would also fire its own attention projection.

So the service resolves repeated requests for the same logical occurrence back
to the existing record instead of creating another, and lets a *changed*
occurrence update one active record rather than stacking a second card beside
it. Grouping relates records in the UI without merging them, so repeated
attempts on one title read as a thread rather than as unrelated warnings.

Two constraints bound this, because deduplication that hides a real failure is
worse than the noise it prevents:

- Rate control never discards a distinct error. A suppressed *projection*
  still leaves its canonical record available in the center.
- Identity keys carry opaque identifiers and stable codes only — never
  user-facing copy, never secrets. Copy changes; identity must not.

## Consequences

**Derived counters are not states, and must not be published as vocabulary.**
A run can terminate while episodes it discovered were never attempted — an
episode failed on every hoster (later episodes are abandoned by design,
because the on-disk count is the catch-up cursor), or the user stopped the
run. Those episodes have no outcome at all. The run detail derived
`episodesDownloading` as `episodesFound - episodesDownloaded - episodesFailed`
and rendered the remainder as **Downloading** on a finished run.

A durable record must distinguish **downloaded**, **failed**, and **not
attempted**, and must never call an unattempted episode downloading, pending,
or failed. A count obtained by subtraction is an inference, and a notification
body is the wrong place to publish an inference the run cannot support.
Adopting the record therefore also obliges correcting the same vocabulary in
the Downloads run detail, so the two surfaces cannot disagree about what
happened.

## Rejected designs

- **Use the observability event log as the store.** Different vocabulary,
  different retention, different privacy requirements.
- **Keep notifications in frontend memory only.** A renderer restart loses
  history, read state, deduplication, and actions.
- **Persist after showing the toast.** A persistence failure would leave a
  visible notification with no durable record.
- **Translate every event-bus event automatically.** User relevance becomes
  implicit and drifts away from the feature that understands the event.
- **Store JavaScript callbacks as actions.** Callbacks cannot survive a
  restart, and persisting them is an unsafe boundary.
- **Create a record for every local success toast.** Routine feedback would
  flood the center and bury the warnings and failures.
- **Delete on dismiss.** Dismissing attention and removing history are
  separate user intentions.
- **Offset pagination.** Live inserts shift pages, producing duplicates or
  gaps.
- **Replay every unread record as a toast on startup.** A restart would
  trigger an interruption storm.
- **Let producers choose delivery channels freely.** Delivery and privacy
  policy would drift independently across bounded contexts.
