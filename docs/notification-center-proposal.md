# Notification Center Proposal — retired

**Status:** Retired 2026-08-25. This file is a redirect, kept only so the
references to it from the SDD-60 artifacts still resolve.

The original 1 946-line proposal (2026-08-03) was the pre-SDD thinking that
started the durable Notification Center. It has been superseded on both of its
axes and is no longer a source anyone should read from:

| What you want | Where it lives now |
|---|---|
| The boundary rule — what counts as a durable notification versus a domain event, a toast, inline feature state, or an observability log line; why deduplication and coalescing exist; every rejected design | [`docs/adr/013-notification-center-boundaries.md`](adr/013-notification-center-boundaries.md) |
| The implementation design — schema, DDL, Go interfaces, module tree, sequence diagrams, Wails contract, testing strategy | `openspec/changes/2026-08-23-sdd-60-notification-center/design.md` |
| What is actually built and what remains | `openspec/changes/2026-08-23-sdd-60-notification-center/tasks.md` |
| The frontend toast pipeline | `.claude/skills/app-notification-pipeline/SKILL.md` |

The proposal's §7, §8, §16.3, §19.1 and §37 had already been marked superseded
by `design.md` before this retirement; §37's component layout in particular was
rejected outright because it is a proven import cycle
(`notification → download → notification`). SDD-60's own risk register named the
document as a hazard for exactly that reason (R-8). Retiring it closes that
risk instead of managing it.

The companion design this file used to link to — the anime-creation and
download-readiness architecture — was retired in the same pass. Its durable
rationale is now
[`docs/adr/014-anime-creation-download-readiness-boundary.md`](adr/014-anime-creation-download-readiness-boundary.md).
