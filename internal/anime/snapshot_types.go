package anime

import (
	"context"
	"crypto/sha256"
	"encoding/hex"

	"autoreas-bridge/internal/events"
)

// SnapshotRecord stores one canonical effective anime snapshot plus its bridge
// metadata.
type SnapshotRecord struct {
	AnimeID       string
	CanonicalJSON []byte
	Hash          string
	// ModifiedAt is the bridge-owned, strictly-monotonic optimistic-concurrency
	// version token (SDD-30, ADR-30-1), stamped on every confirmed write and
	// echoed by mobile as its base for the OCC divergence check.
	ModifiedAt int64
}

// ParseWarning reports one non-fatal parser warning tied to a source line.
type ParseWarning struct {
	Line   int
	Reason string
}

// HashSnapshot returns the stable content hash for one canonical snapshot.
func HashSnapshot(canonicalJSON []byte) string {
	sum := sha256.Sum256(canonicalJSON)
	return hex.EncodeToString(sum[:])
}

// SnapshotStore persists the effective anime snapshot baseline. SDD-55 cold
// cut: the only remaining callers are the SQLite-native write/query paths;
// the inbound Legacy reconcile that used to share this port (startup catch-up,
// runtime watcher) is gone.
type SnapshotStore interface {
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
	ReplaceBaseline(ctx context.Context, current map[string]SnapshotRecord, pruneIDs []string) error
}

// EventPublisher emits domain events produced by anime write flows.
type EventPublisher interface {
	Publish(event events.Event)
}

// WarningLogger records non-fatal boundary warnings.
type WarningLogger interface {
	Warnf(format string, args ...any)
}
