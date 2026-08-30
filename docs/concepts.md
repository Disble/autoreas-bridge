# Autoreas Bridge — Concepts

## PendingChanges

`PendingChanges` is the number of **unsynchronized changelog entries** an anime has accumulated. It tells the user how many local edits are still waiting to be sent to paired mobile devices.

### How it works

Every time the bridge detects a change in an anime (for example `nrocapvisto`, `estado`, etc.), the `ChangelogRecorder` writes a row to SQLite with:

- `anime_id`
- `change_type` (`update`, `delete`, etc.)
- `changed_fields`
- `snapshot_json`
- timestamp

That row stays pending until a paired device performs reconcile and confirms it.

**`changed_fields` is derived, not declared (SDD-64).** It is computed inside the
transaction that commits the write, by comparing that operation's base and
desired snapshots, and it travels to the recorder on the `anime.changed` event.
No producer decides the value. That matters because the previous design asked
each producer to name what it had changed, and none of the six ever did — every
row recorded `[]` while real fields were being rewritten, including the write
that wiped a schedule for six weeks. A list a caller must remember to fill will
eventually be empty; a list computed from the two states already in hand cannot
be. Rows written before that change carry no derived list and still read as `[]`.

### What `ListPendingAnimeSyncs` does

When `GetSyncingAnimeItems()` calls `ListPendingAnimeSyncs`, the service groups pending rows by anime and sets:

```go
PendingChanges: len(group)
```

If an anime had 3 local edits before any device synced, `PendingChanges` will be `3`.

### UI meaning

In `SyncingAnimePanel` it is shown as a badge, for example:

> **Dungeon Meshi**  
> `2 pending changes`

That means: *"This anime has 2 local changes that have not been synced to your mobile/tablet yet."*

### Relationship with reconcile

When the user presses the reconcile button in the dashboard, the bridge publishes a `SyncRequestedEvent`. Connected devices should respond by calling `POST /api/sync/reconcile`, fetch the pending changes, and confirm them. Once confirmed, `PendingChanges` drops to zero and the anime disappears from the syncing panel.
