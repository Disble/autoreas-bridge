package anime

import "context"

// BridgeNativeRegistry (SDD-48, ADR-48-2) is the consumer-defined port for
// the Bridge-native anime ownership set: ids created directly by Bridge
// (e.g. via WriteService.CreateAnime) rather than observed from Legacy's
// animes.dat. It mirrors SnapshotStore's port/implementation split: the
// port lives here in the anime package, the SQLite-backed implementation
// (BridgeOwnedAnimeStore) lives in internal/sync.
//
// Every consumer of this port MUST treat a nil BridgeNativeRegistry as "no
// ownership known" (an empty owned set), never a panic — this is the
// rollback lever for every wiring seam (snapshot_pull_pipeline.go,
// watcher.go, service.go).
type BridgeNativeRegistry interface {
	// ListOwnedIDs returns the full set of Bridge-native anime ids, ready to
	// pass into DiffSnapshots as ownedIDs.
	ListOwnedIDs(ctx context.Context) (map[string]struct{}, error)
	// RegisterOwned marks animeID as Bridge-native. Implementations MUST be
	// idempotent: registering the same id twice is a safe no-op.
	RegisterOwned(ctx context.Context, animeID string) error
}

// loadOwnedIDs returns registry.ListOwnedIDs(ctx), or nil when registry is
// nil -- the shared rollback lever for every DiffSnapshots caller
// (snapshot_pull_pipeline.go, watcher.go): a nil ownedIDs map makes every id
// "unowned", reproducing pre-SDD-48 behavior exactly.
func loadOwnedIDs(ctx context.Context, registry BridgeNativeRegistry) (map[string]struct{}, error) {
	if registry == nil {
		return nil, nil
	}
	return registry.ListOwnedIDs(ctx)
}
