package legacy_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/legacy"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestGatewayRecoveryKeepsRetryableEvidenceAfterAmbiguousAppend(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	base := gatewayAnimeJSON("anime-1", 2)
	desired := gatewayAnimeJSON("anime-1", 3)
	_, base, err := legacy.Decode(base)
	if err != nil {
		t.Fatalf("canonicalize base: %v", err)
	}
	_, desired, err = legacy.Decode(desired)
	if err != nil {
		t.Fatalf("canonicalize desired: %v", err)
	}
	seedGatewaySnapshot(t, snapshots, "anime-1", base, 100)
	dataPath := writeGatewayData(t, base)
	store := bridgeSync.NewWriteBaseStore(db)
	if err := store.Stage(ctx, legacy.WriteOperation{
		OperationID:         "operation-retry",
		AnimeID:             "anime-1",
		BaseModifiedAt:      100,
		IntendedModifiedAt:  200,
		BaseSnapshotJSON:    base,
		BaseHash:            anime.HashSnapshot(base),
		DesiredSnapshotJSON: desired,
		DesiredHash:         anime.HashSnapshot(desired),
		Status:              legacy.WriteOperationStatusStaged,
		CreatedAtMs:         150,
	}); err != nil {
		t.Fatalf("stage retryable operation: %v", err)
	}

	first := newGateway(t, gatewayConfig{
		db: db, path: dataPath, clock: 201, operations: store,
		append: func(_ context.Context, path string, payload []byte) error {
			if err := appendGatewayLine(path, payload); err != nil {
				return err
			}
			return legacy.NewAmbiguousAppendError(context.Canceled)
		},
	})
	if err := first.Recover(ctx); !legacy.IsAmbiguousAppendError(err) {
		t.Fatalf("expected ambiguous recovery append, got %v", err)
	}
	staged, err := store.ListStaged(ctx)
	if err != nil || len(staged) != 1 {
		t.Fatalf("ambiguous recovery append must remain staged: %#v, %v", staged, err)
	}

	restarted := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 202, operations: store})
	if err := restarted.Recover(ctx); err != nil {
		t.Fatalf("finalize ambiguous recovery append: %v", err)
	}
	pending, err := store.ListPendingAnimeChanged(ctx)
	if err != nil || len(pending) != 1 || countGatewayLines(t, dataPath) != 2 {
		t.Fatalf("expected one durable recovery without duplicate append, got %#v, %v", pending, err)
	}
}
