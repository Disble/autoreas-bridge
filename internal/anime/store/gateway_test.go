package store_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestGatewayCurrentBaseSavesSnapshotAndChangelogInOneTransaction pins S1: one
// applied save stores the snapshot and its changelog row, publishes one event
// whose id is the row's source event id.
func TestGatewayCurrentBaseSavesSnapshotAndChangelogInOneTransaction(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	published := []string{}

	gateway := newGateway(t, gatewayConfig{
		db: db, clock: 200,
		publishEvent: func(eventID, _ string, _ []byte) { published = append(published, eventID) },
	})
	base := int64(100)
	result, err := gateway.Update(ctx, store.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &base,
		Mutate:  func(value *domain.Anime, _ bool) { value.SetProgress(3) },
	})
	if err != nil {
		t.Fatalf("update through gateway: %v", err)
	}
	if result.Outcome != store.AnimePatchOutcomeApplied || result.ModifiedAt != 200 {
		t.Fatalf("unexpected applied result: %#v", result)
	}
	if len(published) != 1 || published[0] != "event-1" {
		t.Fatalf("expected one post-commit publication of operation-1, got %v", published)
	}
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get saved snapshot: %v", err)
	}
	if current.ModifiedAt != 200 || !jsonContainsProgress(t, current.CanonicalJSON, 3) {
		t.Fatalf("unexpected saved snapshot: %#v", current)
	}
	rows, err := bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(db)).ListAfterID(ctx, 0)
	if err != nil || len(rows) != 1 || rows[0].SourceEventID != "event-1" || !slices.Equal(rows[0].ChangedFields, []string{"episodesWatched"}) {
		t.Fatalf("expected one changelog row for operation-1 naming episodesWatched: %+v, %v", rows, err)
	}
}

// TestGatewayPublishesOnlyAfterTheCommit proves a subscriber that reads the
// database when it receives the event sees the saved snapshot. Inside the
// transaction its read would wait for the single connection, so it would fail
// on its deadline instead.
func TestGatewayPublishesOnlyAfterTheCommit(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	var seen []byte
	var readErr error
	gateway := newGateway(t, gatewayConfig{db: db, clock: 200, publish: func(id string, _ []byte) {
		readCtx, cancel := context.WithTimeout(ctx, time.Second)
		defer cancel()
		record, err := snapshots.GetSnapshot(readCtx, id)
		seen, readErr = record.CanonicalJSON, err
	}})

	if _, err := gateway.Update(ctx, updateGatewayProgressCommand(100, 3)); err != nil {
		t.Fatalf("update through gateway: %v", err)
	}
	if readErr != nil || !jsonContainsProgress(t, seen, 3) {
		t.Fatalf("subscriber did not read the committed snapshot: %s, %v", seen, readErr)
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
		Mutate:  func(value *domain.Anime, _ bool) { value.SetProgress(9) },
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
	if n := countGatewayRows(t, db, "changelog"); n != 0 {
		t.Fatalf("conflict must not record a changelog row, got %d", n)
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
		Mutate:  func(value *domain.Anime, _ bool) { value.SetProgress(2) },
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
		Mutate:  func(value *domain.Anime, _ bool) { value.SetProgress(7) },
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

type gatewayConfig struct {
	db           *sql.DB
	clock        int64
	publish      func(string, []byte)
	publishEvent func(string, string, []byte)
	// publishChangeType captures the derived change type a save publishes.
	publishChangeType func(string, string)
	eventID           string
}

// newGateway constructs a gateway with test defaults and dependencies.
func newGateway(t *testing.T, config gatewayConfig) *store.Gateway {
	t.Helper()
	db := config.db
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	eventID := config.eventID
	if eventID == "" {
		eventID = "event-1"
	}
	return store.NewGateway(store.GatewayConfig{
		LoadSnapshot: func(ctx context.Context, id string) (store.Snapshot, error) {
			record, err := snapshots.GetSnapshot(ctx, id)
			return store.Snapshot{AnimeID: record.AnimeID, CanonicalJSON: record.CanonicalJSON, Hash: record.Hash, ModifiedAt: record.ModifiedAt}, err
		},
		Saves: bridgeSync.NewAnimeSaveStore(db),
		ListSnapshots: func(ctx context.Context) (map[string]store.Snapshot, error) {
			records, err := snapshots.ListSnapshots(ctx)
			result := make(map[string]store.Snapshot, len(records))
			for id, record := range records {
				result[id] = store.Snapshot{AnimeID: record.AnimeID, CanonicalJSON: record.CanonicalJSON, Hash: record.Hash, ModifiedAt: record.ModifiedAt}
			}
			return result, err
		},
		Conflicts: bridgeSync.NewConflictStore(db),
		PublishChanged: func(event store.CommittedChange) {
			if config.publishEvent != nil {
				config.publishEvent(event.EventID, event.AnimeID, event.Payload)
			}
			if config.publish != nil {
				config.publish(event.AnimeID, event.Payload)
			}
			if config.publishChangeType != nil {
				config.publishChangeType(event.EventID, event.ChangeType)
			}
		},
		Now:        func() time.Time { return time.UnixMilli(config.clock).UTC() },
		NewEventID: func() string { return eventID },
	})
}

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

// countGatewayRows counts the rows of one table.
func countGatewayRows(t *testing.T, db *sql.DB, table string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&n); err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return n
}

// TestGatewayPublishesCreateForTheFirstWriteAndUpdateAfterwards is the root of
// the "every create reaches Mobile as an update" defect: the change type was
// never derived, so all publishers sent an empty one. The first write of an
// anime the store has never held must publish "create"; the next one "update".
func TestGatewayPublishesCreateForTheFirstWriteAndUpdateAfterwards(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	published := []string{}
	write := func(progress float64) {
		t.Helper()
		gateway := newGateway(t, gatewayConfig{
			db: db, clock: int64(200 * progress), eventID: "operation-" + jsonNumber(progress),
			publishChangeType: func(_ string, changeType string) { published = append(published, changeType) },
		})
		if _, err := gateway.Update(ctx, store.UpdateCommand{
			AnimeID:         "anime-created",
			CreateIfMissing: true,
			Mutate:          func(value *domain.Anime, _ bool) { value.SetProgress(progress) },
		}); err != nil {
			t.Fatalf("write through gateway: %v", err)
		}
	}

	write(1)
	write(2)

	if want := []string{"create", "update"}; !slices.Equal(published, want) {
		t.Fatalf("expected change types %v, got %v", want, published)
	}
}
