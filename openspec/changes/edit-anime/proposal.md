# Proposal: Edit Anime

## Intent

Enable fast consecutive desktop anime edits without forcing users through a read-only detail flow plus scattered one-field actions. The bridge needs one authoritative editor that preserves legacy data fidelity, uses explicit OCC, and treats schedule ordering as shared relational state.

## Scope

### In Scope
- Add a dedicated **Anime Editor** section with a watching-first searchable/filterable list on the left and a reusable ID-driven `AnimeEditor` on the right.
- Add an **Edit anime** entry from Anime Detail that deep-links into the same editor with the anime preselected.
- Support one atomic general save per anime with validation, dirty-state guard, refresh, selection preservation, and explicit `modified_at` conflict outcomes.
- Move schedule/day/order editing into a near-full-screen global modal for all active anime with one shared draft, reset/apply controls, highlighted origin anime, and atomic whole-draft apply.

### Out of Scope
- Changing Catalog into a management surface, changing History away from read-only navigation, or repurposing Chapters beyond today's progress.
- General editing of `_id`, `modified_at`, `repetir`, or `primeravez`, and folding Repeat/Restore/history into the general form.
- A universal drag-board abstraction beyond anime schedule ordering.

## Capabilities

### New Capabilities
- `anime-editor`: dedicated editor workspace and reusable editor flow for single-record editing.
- `anime-schedule-ordering`: reusable schedule-ordering feature and global active-anime schedule modal.

### Modified Capabilities
- `legacy-gateway`: preserve unknown legacy fields and full-fidelity `estudios`/`portada` round-trips during editor writes.
- `sdd-50-conflict-seams`: extend authoritative outcome/base-token seams to editor saves and bulk schedule apply.

## Approach

- Reuse the existing canonical `WriteService` + `legacy.Gateway` write path; DO NOT compose the editor from field-specific desktop commands.
- Keep frequent fields visible, move secondary metadata under **More details**, use independent panel scrolling, and keep the save area sticky.
- Treat `activo=false` as **Deactivate anime**, not deletion.
- Accepted edits MUST produce one append, one `anime.changed`, one changelog row, and one websocket broadcast.
- Rejection behavior MUST stay explicit: stale base returns `conflict` with no append, invalid values are rejected, unsaved selection changes are guarded, and schedule concurrency rejects the whole draft with no partial application.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/app/routes/*` | Modified | Add editor navigation/deep-link composition |
| `frontend/src/features/anime-detail/ui/AnimeDetail/*` | Modified | Launch editor while keeping lifecycle actions separate |
| `frontend/src/features/season/ui/OrderingBoard/*` | Modified | Refactor into reusable anime schedule ordering core |
| `internal/anime/*`, `app_runtime.go`, `internal/api/contracts/*` | Modified | Add authoritative editor contracts and lossless write path |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Lossy DTO for `estudios`/`portada` | High | Design full-fidelity editor contract before implementation |
| Desktop OCC drift repeats in new flow | Medium | Reuse one explicit applied/no-op/conflict/error contract |
| Global schedule draft corrupts relational order | Medium | Validate duplicates/positions and reject stale drafts atomically |

## Rollback Plan

Remove the editor route/entry points and keep existing detail, Catalog, History, Chapters, and Season flows. Because writes stay on the existing gateway boundary, rollback is primarily a code-path removal, not a data migration.

The batch-replacement durability subsystem introduced by this change adds new database state (`anime_batch_replacements` table with staged operation rows, replacement-phase journal entries), temp files (`.replace.tmp`), and backup files (`.replace.bak`) that exist alongside the canonical `animes.dat`. These artifacts are created and cleaned up by the new write path. A straightforward code-path rollback to the pre-editor binary removes the code that creates them; pre-existing rows or temp/backup files left over from an incomplete batch (e.g. a mid-batch crash) become orphans.

Recovery strategy (fix-forward): after rollback, rerun the new editor binary's `Recover` path — it handles orphaned journal/staged rows, promotes or restores temp/backup files, and finalizes or aborts incomplete batches before the old code path takes over. A downgrade during a mid-batch crash window requires either manually restoring `animes.dat` from the `.replace.bak` backup or rerunning the new binary's `Recover` first. There is no destructive schema migration to undo — the `anime_batch_replacements` table is additive and ignored by pre-editor code.

## Dependencies

- Existing `WriteService` / `legacy.Gateway` OCC boundary
- `@dnd-kit/react` and `@dnd-kit/helpers`

## Success Criteria

- [ ] Users can open the editor from its dedicated section or Anime Detail and save one atomic multi-field edit with refreshed authority.
- [ ] Stale base, invalid edits, unsaved switches, and schedule concurrency all refuse to append or partially apply changes.
- [ ] Unknown legacy fields plus `estudios` and `portada` round-trip without loss, and each accepted write emits one canonical downstream update.

## Open Questions

- None at proposal level. Design must define the exact editor DTO and schedule-apply contract shape.
