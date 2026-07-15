package anime

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/events"
)

type SnapshotRecord struct {
	AnimeID       string
	CanonicalJSON []byte
	Hash          string
	// ModifiedAt is the bridge-owned, strictly-monotonic optimistic-concurrency
	// version token (SDD-30, ADR-30-1). It is stamped via stampModifiedAt on
	// every confirmed change (write path and observe path) and echoed by mobile
	// as its base for the OCC divergence check. Pre-migration rows read back 0.
	ModifiedAt int64
}

// stampModifiedAt returns the next strictly-monotonic modified_at token for a
// record whose previous token was prev (SDD-30, ADR-30-1/3). It honors the
// "modified date" framing by using the current wall-clock millis when they are
// already ahead of prev, but GUARANTEES monotonicity a plain clock cannot:
// same-millisecond writes still advance (prev+1), and a regressed clock can
// never make the token go backwards (clamped to prev+1). A fresh record
// (prev=0) yields max(now_ms, 1).
func stampModifiedAt(prev int64, now func() time.Time) int64 {
	next := now().UnixMilli()
	if next <= prev {
		next = prev + 1
	}
	return next
}

type ParseWarning struct {
	Line   int
	Reason string
}

func HashSnapshot(canonicalJSON []byte) string {
	sum := sha256.Sum256(canonicalJSON)
	return hex.EncodeToString(sum[:])
}

func cloneSnapshotRecords(input map[string]SnapshotRecord) map[string]SnapshotRecord {
	if input == nil {
		return nil
	}

	cloned := make(map[string]SnapshotRecord, len(input))
	for id, record := range input {
		cloned[id] = SnapshotRecord{
			AnimeID:       record.AnimeID,
			CanonicalJSON: append([]byte(nil), record.CanonicalJSON...),
			Hash:          record.Hash,
			ModifiedAt:    record.ModifiedAt,
		}
	}

	return cloned
}

// DiffSnapshots compares the freshly observed current snapshots against the
// persisted baseline and reports the deltas to publish plus the ids to prune.
// As a side effect (SDD-30, ADR-30-1/3) it stamps current's modified_at OCC
// token IN PLACE for every id: a record whose hash is unchanged from baseline
// COPIES the baseline token (no bump -- it is not an observed change); a new
// or hash-changed record gets a freshly bumped token via stampModifiedAt. This
// guarantees current -- which callers persist verbatim via ReplaceBaseline
// (watcher.go/startup_catchup.go) -- always carries a correct token without
// requiring every call site to duplicate the stamping rule.
//
// ownedIDs (SDD-48, ADR-48-2) is the Bridge-native ownership set: a baseline
// id present in ownedIDs is exempted from the reconcile-absence soft-delete
// below -- it is carried forward verbatim, exactly like an already
// soft-deleted baseline record. DiffSnapshots stays a PURE diff: it never
// queries the DB itself; the caller (pipeline/watcher) loads ownedIDs and
// passes it in. A nil ownedIDs map is the rollback lever -- every id is
// treated as unowned, reproducing the pre-SDD-48 behavior exactly.
func DiffSnapshots(current map[string]SnapshotRecord, baseline map[string]SnapshotRecord, ownedIDs map[string]struct{}) ([]events.AnimeChangedEvent, []string) {
	currentIDs := sortedSnapshotIDs(current)
	updates := make([]events.AnimeChangedEvent, 0, len(currentIDs))
	for _, id := range currentIDs {
		record := current[id]
		persisted, exists := baseline[id]
		if exists && persisted.Hash == record.Hash {
			record.ModifiedAt = persisted.ModifiedAt
			current[id] = record
			continue
		}

		prevModifiedAt := int64(0)
		if exists {
			prevModifiedAt = persisted.ModifiedAt
		}
		record.ModifiedAt = stampModifiedAt(prevModifiedAt, time.Now)
		current[id] = record

		updates = append(updates, events.AnimeChangedEvent{
			AnimeID: id,
			Payload: append([]byte(nil), record.CanonicalJSON...),
		})
	}

	// pruneIDs stays in DiffSnapshots' return signature for genuine, intentional
	// removals -- but a baseline id absent from current (the $$deleted tombstone
	// path, or any other vanish-from-file case) is NEVER one of them (SDD-30,
	// ADR-30-3b). Soft-delete only: retain the row in current with Activo=0 +
	// FechaEliminacion stamped onto its last-known canonical payload, and bump
	// its modified_at like any other observed change.
	pruneIDs := make([]string, 0)
	softDeleteIDs := sortedSnapshotIDs(baseline)
	softDeletes := make([]events.AnimeChangedEvent, 0)
	for _, id := range softDeleteIDs {
		if _, exists := current[id]; exists {
			continue
		}

		persisted := baseline[id]
		if _, owned := ownedIDs[id]; owned || isSoftDeletedSnapshot(persisted) {
			// Retain the baseline row verbatim: no Activo flip, no
			// FechaEliminacion stamp, no modified_at bump, no event. An owned
			// id absent from Legacy's animes.dat is not a deletion signal
			// (SDD-48, ADR-48-2); an already soft-deleted id keeps its
			// tombstone (SDD-30, ADR-30-3b) — both mean "leave as-is".
			current[id] = persisted
			continue
		}

		softDeletedPayload, err := softDeleteCanonicalJSON(persisted.CanonicalJSON, time.Now())
		if err != nil {
			// Malformed baseline payload: fall back to the pre-SDD-30 prune
			// behavior rather than silently dropping the event -- this should
			// not happen for any record this package itself wrote.
			pruneIDs = append(pruneIDs, id)
			continue
		}

		record := SnapshotRecord{
			AnimeID:       id,
			CanonicalJSON: softDeletedPayload,
			Hash:          HashSnapshot(softDeletedPayload),
			ModifiedAt:    stampModifiedAt(persisted.ModifiedAt, time.Now),
		}
		current[id] = record

		softDeletes = append(softDeletes, events.AnimeChangedEvent{
			AnimeID: id,
			Payload: append([]byte(nil), softDeletedPayload...),
		})
	}
	sort.Strings(pruneIDs)

	eventsOut := make([]events.AnimeChangedEvent, 0, len(updates)+len(softDeletes))
	eventsOut = append(eventsOut, updates...)
	eventsOut = append(eventsOut, softDeletes...)

	return eventsOut, pruneIDs
}

func isSoftDeletedSnapshot(record SnapshotRecord) bool {
	softDeleted, err := legacy.IsSoftDeleted(record.CanonicalJSON)
	return err == nil && softDeleted
}

// softDeleteCanonicalJSON takes a baseline record's canonical JSON and
// returns a new canonical payload with Activo forced to false and
// FechaEliminacion stamped to at (SDD-30, ADR-30-3b). All other fields
// (including unknown fields the Legacy wire envelope round-trips opaquely) are
// preserved.
func softDeleteCanonicalJSON(canonicalJSON []byte, at time.Time) ([]byte, error) {
	return legacy.Deactivate(canonicalJSON, at)
}

func sortedSnapshotIDs(records map[string]SnapshotRecord) []string {
	ids := make([]string, 0, len(records))
	for id := range records {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
