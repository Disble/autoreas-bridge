package store_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestGatewayCurrentBaseFinalizesToSnapshotStoreAndPublishes(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	published := make([][]byte, 0, 1)

	gateway := newGateway(t, gatewayConfig{
		db:      db,
		clock:   200,
		publish: func(_ string, payload []byte) { published = append(published, append([]byte(nil), payload...)) },
	})
	base := int64(100)
	result, err := gateway.Update(ctx, store.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &base,
		Mutate:  func(value *domain.Anime) { value.SetProgress(3) },
	})
	if err != nil {
		t.Fatalf("update through gateway: %v", err)
	}
	if result.Outcome != store.AnimePatchOutcomeApplied || result.ModifiedAt != 200 {
		t.Fatalf("unexpected applied result: %#v", result)
	}
	if len(published) != 1 {
		t.Fatalf("expected one post-commit publication, got %d", len(published))
	}
	pending, err := bridgeSync.NewWriteBaseStore(db).ListPendingAnimeChanged(ctx)
	if err != nil || len(pending) != 0 {
		t.Fatalf("runtime finalization did not drain its outbox: %#v, %v", pending, err)
	}
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get finalized snapshot: %v", err)
	}
	if current.ModifiedAt != 200 || !jsonContainsProgress(t, current.CanonicalJSON, 3) {
		t.Fatalf("unexpected finalized snapshot: %#v", current)
	}
	baseRecord, err := bridgeSync.NewWriteBaseStore(db).GetBase(ctx, "anime-1", 200)
	if err != nil {
		t.Fatalf("get retained pre-write base: %v", err)
	}
	if baseRecord.BaseModifiedAt != 100 || !jsonContainsProgress(t, baseRecord.SnapshotJSON, 2) {
		t.Fatalf("unexpected retained base: %#v", baseRecord)
	}
}

func TestGatewayExplicitStaleBaseRecordsConflictWithoutFinalizeOrPublish(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 200)
	published := 0
	gateway := newGateway(t, gatewayConfig{db: db, clock: 300, publish: func(string, []byte) { published++ }})
	stale := int64(100)

	result, err := gateway.Update(ctx, store.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &stale,
		Mutate:  func(value *domain.Anime) { value.SetProgress(9) },
	})
	if err != nil {
		t.Fatalf("stale update: %v", err)
	}
	if result.Outcome != store.AnimePatchOutcomeConflict || result.ModifiedAt != 200 || result.ConflictID == "" {
		t.Fatalf("unexpected conflict result: %#v", result)
	}
	if published != 0 {
		t.Fatalf("expected no publication for conflict, got %d", published)
	}
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != 200 || !jsonContainsProgress(t, current.CanonicalJSON, 2) {
		t.Fatalf("conflict must not finalize the stale write: %#v, %v", current, err)
	}
	conflicts, err := bridgeSync.NewConflictStore(db).ListConflicts(ctx)
	if err != nil {
		t.Fatalf("list conflicts: %v", err)
	}
	if len(conflicts) != 1 || conflicts[0].ConflictID != result.ConflictID {
		t.Fatalf("unexpected stored conflicts: %#v", conflicts)
	}
}

func TestGatewayStaleNoOpDoesNotFinalizeStampConflictOrPublish(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 200)
	published := 0
	gateway := newGateway(t, gatewayConfig{db: db, clock: 300, publish: func(string, []byte) { published++ }})
	stale := int64(100)

	result, err := gateway.Update(ctx, store.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &stale,
		Mutate:  func(value *domain.Anime) { value.SetProgress(2) },
	})
	if err != nil {
		t.Fatalf("no-op update: %v", err)
	}
	if result.Outcome != store.AnimePatchOutcomeNoOp || result.ModifiedAt != 200 {
		t.Fatalf("unexpected no-op result: %#v", result)
	}
	if published != 0 {
		t.Fatal("no-op must not publish")
	}
	conflicts, err := bridgeSync.NewConflictStore(db).ListConflicts(ctx)
	if err != nil || len(conflicts) != 0 {
		t.Fatalf("no-op must not record a conflict: %#v, %v", conflicts, err)
	}
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != 200 {
		t.Fatalf("no-op changed current token: %#v, %v", current, err)
	}
}

func TestGatewayBaseLessExistingWriteKeepsLastWriteWinsCompatibility(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	seedGatewaySnapshot(t, bridgeSync.NewAnimeSnapshotStore(db), "anime-1", gatewayAnimeJSON("anime-1", 2), 200)
	gateway := newGateway(t, gatewayConfig{db: db, clock: 300})

	result, err := gateway.Update(ctx, store.UpdateCommand{
		AnimeID: "anime-1",
		Mutate:  func(value *domain.Anime) { value.SetProgress(7) },
	})
	if err != nil {
		t.Fatalf("base-less compatibility update: %v", err)
	}
	if result.Outcome != store.AnimePatchOutcomeApplied || result.ModifiedAt != 300 {
		t.Fatalf("unexpected base-less result: %#v", result)
	}
	conflicts, err := bridgeSync.NewConflictStore(db).ListConflicts(ctx)
	if err != nil || len(conflicts) != 0 {
		t.Fatalf("base-less compatibility path recorded conflict: %#v, %v", conflicts, err)
	}
}

// TestGatewayRecoveryRetriesFinalizeForAStagedButUnfinalizedWrite proves the
// SDD-55 Slice B recovery contract: with the file channel gone, the only
// crash window left is between Stage and Finalize. Recover must retry the
// idempotent Finalize step and the outbox drain must then publish exactly
// once, without ever touching a file.
func TestGatewayRecoveryRetriesFinalizeForAStagedButUnfinalizedWrite(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	finalizeFailure := &failFinalizeOnceStore{WriteBaseStore: bridgeSync.NewWriteBaseStore(db)}
	first := newGateway(t, gatewayConfig{db: db, clock: 200, operations: finalizeFailure})
	base := int64(100)

	_, err := first.Update(ctx, store.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &base,
		Mutate:  func(value *domain.Anime) { value.SetProgress(3) },
	})
	if err == nil {
		t.Fatal("expected injected finalization failure")
	}
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != 100 {
		t.Fatalf("expected the crash to leave the write staged, not finalized: %#v, %v", current, err)
	}

	published := 0
	restarted := newGateway(t, gatewayConfig{db: db, clock: 201, publish: func(string, []byte) { published++ }})
	if err := restarted.Recover(ctx); err != nil {
		t.Fatalf("recover staged write: %v", err)
	}
	if published != 0 {
		t.Fatalf("recovery published before the durable outbox drain: %d", published)
	}
	if err := restarted.DrainOutbox(ctx); err != nil {
		t.Fatalf("drain recovered write: %v", err)
	}
	if published != 1 {
		t.Fatalf("expected one recovered publication, got %d", published)
	}
	recovered, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil || recovered.ModifiedAt != 200 || !jsonContainsProgress(t, recovered.CanonicalJSON, 3) {
		t.Fatalf("unexpected recovered snapshot: %#v, %v", recovered, err)
	}

	// Recovering an already-finalized operation a second time stays a no-op
	// (Finalize is idempotent) instead of erroring or re-publishing.
	if err := restarted.Recover(ctx); err != nil {
		t.Fatalf("second recover of an already-finalized write must be a no-op: %v", err)
	}
}

type gatewayConfig struct {
	db           *sql.DB
	clock        int64
	operations   store.WriteBaseStore
	outbox       store.AnimeChangedOutboxStore
	publish      func(string, []byte)
	publishEvent func(string, string, []byte)
	// publishFields captures the derived changed-field list a drain delivers,
	// which is the whole point of widening PublishChanged.
	publishFields func(string, []string)
	load          func(context.Context, string) (store.Snapshot, error)
	operationID   string
}

// newGateway constructs a gateway with test defaults and dependencies.
func newGateway(t *testing.T, config gatewayConfig) *store.Gateway {
	t.Helper()
	db := config.db
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	operations := config.operations
	if operations == nil {
		operations = bridgeSync.NewWriteBaseStore(db)
	}
	outbox := config.outbox
	if outbox == nil {
		outbox = bridgeSync.NewWriteBaseStore(db)
	}
	load := config.load
	if load == nil {
		load = func(ctx context.Context, id string) (store.Snapshot, error) {
			record, err := snapshots.GetSnapshot(ctx, id)
			return store.Snapshot{AnimeID: record.AnimeID, CanonicalJSON: record.CanonicalJSON, Hash: record.Hash, ModifiedAt: record.ModifiedAt}, err
		}
	}
	operationID := config.operationID
	if operationID == "" {
		operationID = "operation-1"
	}
	return store.NewGateway(store.GatewayConfig{
		LoadSnapshot: load,
		ListSnapshots: func(ctx context.Context) (map[string]store.Snapshot, error) {
			records, err := snapshots.ListSnapshots(ctx)
			result := make(map[string]store.Snapshot, len(records))
			for id, record := range records {
				result[id] = store.Snapshot{AnimeID: record.AnimeID, CanonicalJSON: record.CanonicalJSON, Hash: record.Hash, ModifiedAt: record.ModifiedAt}
			}
			return result, err
		},
		Operations: operations,
		Outbox:     outbox,
		Conflicts:  bridgeSync.NewConflictStore(db),
		PublishChanged: func(eventID string, animeID string, payload []byte, changedFields []string) {
			if config.publishEvent != nil {
				config.publishEvent(eventID, animeID, payload)
			}
			if config.publish != nil {
				config.publish(animeID, payload)
			}
			if config.publishFields != nil {
				config.publishFields(eventID, changedFields)
			}
		},
		Now:            func() time.Time { return time.UnixMilli(config.clock).UTC() },
		NewOperationID: func() string { return operationID },
	})
}

type failFinalizeOnceStore struct {
	store.WriteBaseStore
	failed bool
}

func (s *failFinalizeOnceStore) Finalize(ctx context.Context, operationID string, committedAtMs int64) error {
	if !s.failed {
		s.failed = true
		return errFinalizeInjected
	}
	return s.WriteBaseStore.Finalize(ctx, operationID, committedAtMs)
}

var errFinalizeInjected = fmt.Errorf("injected finalize failure")

// gatewayAnimeJSON creates a minimal stored anime payload for gateway tests.
// The name is derived from the id rather than fixed: the catalogue enforces
// unique anime names, so a shared fixture name makes any case seeding two
// animes fail on the constraint instead of on what it set out to prove.
func gatewayAnimeJSON(id string, progress float64) []byte {
	return []byte(`{"id":"` + id + `","name":"Test ` + id + `","episodesWatched":` + jsonNumber(progress) + `,"status":2,"active":true}`)
}

// jsonNumber encodes a numeric fixture value as JSON.
func jsonNumber(value float64) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

// openGatewayDB opens a temporary bridge database for gateway tests.
func openGatewayDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// seedGatewaySnapshot stores one authoritative gateway snapshot.
func seedGatewaySnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, id string, payload []byte, modifiedAt int64) {
	t.Helper()
	err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		id: {AnimeID: id, CanonicalJSON: payload, Hash: anime.HashSnapshot(payload), ModifiedAt: modifiedAt},
	}, nil)
	if err != nil {
		t.Fatalf("seed gateway snapshot: %v", err)
	}
}

// jsonContainsProgress reports whether a payload contains the requested progress.
func jsonContainsProgress(t *testing.T, payload []byte, want float64) bool {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(payload, &value); err != nil {
		t.Fatalf("unmarshal gateway payload: %v", err)
	}
	return value["episodesWatched"] == want
}
