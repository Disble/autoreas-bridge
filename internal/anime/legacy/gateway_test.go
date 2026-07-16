package legacy_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestGatewayCurrentBaseStagesAppendsFinalizesAndPublishes(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	dataPath := writeGatewayData(t, gatewayAnimeJSON("anime-1", 2))
	published := make([][]byte, 0, 1)

	gateway := newGateway(t, gatewayConfig{
		db:      db,
		path:    dataPath,
		clock:   200,
		publish: func(_ string, payload []byte) { published = append(published, append([]byte(nil), payload...)) },
	})
	base := int64(100)
	result, err := gateway.Update(ctx, legacy.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &base,
		Mutate:  func(value *domain.Anime) { value.SetProgress(3) },
	})
	if err != nil {
		t.Fatalf("update through gateway: %v", err)
	}
	if result.Outcome != legacy.AnimePatchOutcomeApplied || result.ModifiedAt != 200 {
		t.Fatalf("unexpected applied result: %#v", result)
	}
	if got := countGatewayLines(t, dataPath); got != 2 {
		t.Fatalf("expected one appended line, got %d total lines", got)
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

func TestGatewayExplicitStaleBaseRecordsConflictWithoutAppendOrPublish(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 200)
	dataPath := writeGatewayData(t, gatewayAnimeJSON("anime-1", 2))
	published := 0
	gateway := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 300, publish: func(string, []byte) { published++ }})
	stale := int64(100)

	result, err := gateway.Update(ctx, legacy.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &stale,
		Mutate:  func(value *domain.Anime) { value.SetProgress(9) },
	})
	if err != nil {
		t.Fatalf("stale update: %v", err)
	}
	if result.Outcome != legacy.AnimePatchOutcomeConflict || result.ModifiedAt != 200 || result.ConflictID == "" {
		t.Fatalf("unexpected conflict result: %#v", result)
	}
	if got := countGatewayLines(t, dataPath); got != 1 {
		t.Fatalf("expected no stale append, got %d lines", got)
	}
	if published != 0 {
		t.Fatalf("expected no publication for conflict, got %d", published)
	}
	conflicts, err := bridgeSync.NewConflictStore(db).ListConflicts(ctx)
	if err != nil {
		t.Fatalf("list conflicts: %v", err)
	}
	if len(conflicts) != 1 || conflicts[0].ConflictID != result.ConflictID {
		t.Fatalf("unexpected stored conflicts: %#v", conflicts)
	}
}

func TestGatewayStaleNoOpDoesNotWriteStampConflictOrPublish(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 200)
	dataPath := writeGatewayData(t, gatewayAnimeJSON("anime-1", 2))
	published := 0
	gateway := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 300, publish: func(string, []byte) { published++ }})
	stale := int64(100)

	result, err := gateway.Update(ctx, legacy.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &stale,
		Mutate:  func(value *domain.Anime) { value.SetProgress(2) },
	})
	if err != nil {
		t.Fatalf("no-op update: %v", err)
	}
	if result.Outcome != legacy.AnimePatchOutcomeNoOp || result.ModifiedAt != 200 {
		t.Fatalf("unexpected no-op result: %#v", result)
	}
	if countGatewayLines(t, dataPath) != 1 || published != 0 {
		t.Fatal("no-op must not append or publish")
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
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 200)
	dataPath := writeGatewayData(t, gatewayAnimeJSON("anime-1", 2))
	gateway := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 300})

	result, err := gateway.Update(ctx, legacy.UpdateCommand{
		AnimeID: "anime-1",
		Mutate:  func(value *domain.Anime) { value.SetProgress(7) },
	})
	if err != nil {
		t.Fatalf("base-less compatibility update: %v", err)
	}
	if result.Outcome != legacy.AnimePatchOutcomeApplied || result.ModifiedAt != 300 {
		t.Fatalf("unexpected base-less result: %#v", result)
	}
	conflicts, err := bridgeSync.NewConflictStore(db).ListConflicts(ctx)
	if err != nil || len(conflicts) != 0 {
		t.Fatalf("base-less compatibility path recorded conflict: %#v, %v", conflicts, err)
	}
}

func TestGatewayRecoveryFinalizesEffectiveDesiredWithoutDuplicateAppend(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	dataPath := writeGatewayData(t, gatewayAnimeJSON("anime-1", 2))
	finalizeFailure := &failFinalizeOnceStore{WriteBaseStore: bridgeSync.NewWriteBaseStore(db)}
	first := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 200, operations: finalizeFailure})
	base := int64(100)

	_, err := first.Update(ctx, legacy.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &base,
		Mutate:  func(value *domain.Anime) { value.SetProgress(3) },
	})
	if err == nil {
		t.Fatal("expected injected finalization failure")
	}
	if got := countGatewayLines(t, dataPath); got != 2 {
		t.Fatalf("expected intended line to be effective before recovery, got %d", got)
	}
	published := 0
	restarted := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 201, publish: func(string, []byte) { published++ }})
	if err := restarted.Recover(ctx); err != nil {
		t.Fatalf("recover staged write: %v", err)
	}
	if got := countGatewayLines(t, dataPath); got != 2 {
		t.Fatalf("recovery duplicated effective append: %d lines", got)
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
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != 200 || !jsonContainsProgress(t, current.CanonicalJSON, 3) {
		t.Fatalf("unexpected recovered snapshot: %#v, %v", current, err)
	}
}

type gatewayConfig struct {
	db                *sql.DB
	path              string
	clock             int64
	operations        legacy.WriteBaseStore
	outbox            legacy.AnimeChangedOutboxStore
	publish           func(string, []byte)
	publishEvent      func(string, string, []byte)
	append            func(context.Context, string, []byte) error
	load              func(context.Context, string) (legacy.Snapshot, error)
	operationID       string
	replaceCheckpoint func(legacy.BatchReplacementPhase) error
	replacementEcho   legacy.ReplacementEchoRegistry
}

func newGateway(t *testing.T, config gatewayConfig) *legacy.Gateway {
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
		load = func(ctx context.Context, id string) (legacy.Snapshot, error) {
			record, err := snapshots.GetSnapshot(ctx, id)
			return legacy.Snapshot{AnimeID: record.AnimeID, CanonicalJSON: record.CanonicalJSON, Hash: record.Hash, ModifiedAt: record.ModifiedAt}, err
		}
	}
	appendFn := config.append
	if appendFn == nil {
		appendFn = func(_ context.Context, path string, payload []byte) error {
			return appendGatewayLine(path, payload)
		}
	}
	operationID := config.operationID
	if operationID == "" {
		operationID = "operation-1"
	}
	return legacy.NewGateway(legacy.GatewayConfig{
		LoadSnapshot: load,
		ListSnapshots: func(ctx context.Context) (map[string]legacy.Snapshot, error) {
			records, err := snapshots.ListSnapshots(ctx)
			result := make(map[string]legacy.Snapshot, len(records))
			for id, record := range records {
				result[id] = legacy.Snapshot{AnimeID: record.AnimeID, CanonicalJSON: record.CanonicalJSON, Hash: record.Hash, ModifiedAt: record.ModifiedAt}
			}
			return result, err
		},
		FilePath:   config.path,
		Operations: operations,
		Outbox:     outbox,
		Conflicts:  bridgeSync.NewConflictStore(db),
		Append:     appendFn,
		PublishChanged: func(eventID string, animeID string, payload []byte) {
			if config.publishEvent != nil {
				config.publishEvent(eventID, animeID, payload)
			}
			if config.publish != nil {
				config.publish(animeID, payload)
			}
		},
		Now:               func() time.Time { return time.UnixMilli(config.clock).UTC() },
		NewOperationID:    func() string { return operationID },
		ReplaceCheckpoint: config.replaceCheckpoint,
		ReplacementEcho:   config.replacementEcho,
	})
}

type failFinalizeOnceStore struct {
	legacy.WriteBaseStore
	failed bool
}

func (s *failFinalizeOnceStore) Finalize(ctx context.Context, operationID string, committedAtMs int64) error {
	if !s.failed {
		s.failed = true
		return os.ErrInvalid
	}
	return s.WriteBaseStore.Finalize(ctx, operationID, committedAtMs)
}

func gatewayAnimeJSON(id string, progress float64) []byte {
	return []byte(`{"_id":"` + id + `","nombre":"Test","nrocapvisto":` + jsonNumber(progress) + `,"estado":2,"activo":true}`)
}

func jsonNumber(value float64) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func openGatewayDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func seedGatewaySnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, id string, payload []byte, modifiedAt int64) {
	t.Helper()
	err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		id: {AnimeID: id, CanonicalJSON: payload, Hash: anime.HashSnapshot(payload), ModifiedAt: modifiedAt},
	}, nil)
	if err != nil {
		t.Fatalf("seed gateway snapshot: %v", err)
	}
}

func writeGatewayData(t *testing.T, payload []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "animes.dat")
	if err := os.WriteFile(path, append(append([]byte(nil), payload...), '\n'), 0o600); err != nil {
		t.Fatalf("write gateway fixture: %v", err)
	}
	return path
}

func appendGatewayLine(path string, payload []byte) error {
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(append(bytes.TrimRight(payload, "\r\n"), '\n'))
	return err
}

func countGatewayLines(t *testing.T, path string) int {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read gateway data: %v", err)
	}
	return len(bytes.Split(bytes.TrimSpace(data), []byte("\n")))
}

func jsonContainsProgress(t *testing.T, payload []byte, want float64) bool {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(payload, &value); err != nil {
		t.Fatalf("unmarshal gateway payload: %v", err)
	}
	return value["nrocapvisto"] == want
}
