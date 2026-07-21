package store_test

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/store"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestGatewayPartialRecoveryRetainsEarlierCommittedOutbox proves that when
// recovery replays several staged operations, an earlier one that already
// finalized keeps its durable outbox event even if a later one's Finalize
// fails. SDD-55 Slice B: the only crash window left is Stage-vs-Finalize (no
// file append), so the injected failure is a Finalize failure, not an
// ambiguous append.
func TestGatewayPartialRecoveryRetainsEarlierCommittedOutbox(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	baseA := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-a", 1))
	desiredA := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-a", 2))
	baseB := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-b", 3))
	desiredB := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-b", 4))
	if err := snapshots.ReplaceBaseline(ctx, map[string]anime.SnapshotRecord{
		"anime-a": {AnimeID: "anime-a", CanonicalJSON: baseA, Hash: anime.HashSnapshot(baseA), ModifiedAt: 100},
		"anime-b": {AnimeID: "anime-b", CanonicalJSON: baseB, Hash: anime.HashSnapshot(baseB), ModifiedAt: 100},
	}, nil); err != nil {
		t.Fatalf("seed recovery snapshots: %v", err)
	}
	writeBases := bridgeSync.NewWriteBaseStore(db)
	stageGatewayOperation(t, writeBases, "operation-a", "anime-a", 100, 200, baseA, desiredA, 100)
	stageGatewayOperation(t, writeBases, "operation-b", "anime-b", 100, 201, baseB, desiredB, 101)

	failSecond := &failFinalizeForOperationStore{WriteBaseStore: writeBases, failOperationID: "operation-b"}
	first := newGateway(t, gatewayConfig{db: db, clock: 300, operations: failSecond})
	if err := first.Recover(ctx); !errors.Is(err, errFinalizeInjected) {
		t.Fatalf("expected second recovery failure, got %v", err)
	}
	pending, err := writeBases.ListPendingAnimeChanged(ctx)
	if err != nil || len(pending) != 1 || pending[0].EventID != "operation-a" {
		t.Fatalf("first committed recovery was not durable: %#v, %v", pending, err)
	}

	published := []string{}
	second := newGateway(t, gatewayConfig{
		db: db, clock: 301,
		publishEvent: func(eventID, _ string, _ []byte) { published = append(published, eventID) },
	})
	if err := second.Recover(ctx); err != nil {
		t.Fatalf("retry staged recovery: %v", err)
	}
	if err := second.DrainOutbox(ctx); err != nil {
		t.Fatalf("drain recovered outbox: %v", err)
	}
	if len(published) != 2 || published[0] != "operation-a" || published[1] != "operation-b" {
		t.Fatalf("expected stable recovered events in order, got %#v", published)
	}
}

func TestGatewayOutboxReplayUsesStableEventIDAndMarksOnlyAfterPublish(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	writeBases := bridgeSync.NewWriteBaseStore(db)
	operation := anime.WriteOperation{
		OperationID: "operation-replay", AnimeID: "anime-replay",
		BaseModifiedAt: 10, IntendedModifiedAt: 20,
		BaseSnapshotJSON:    canonicalGatewayPayload(t, gatewayAnimeJSON("anime-replay", 1)),
		DesiredSnapshotJSON: canonicalGatewayPayload(t, gatewayAnimeJSON("anime-replay", 2)),
		Status:              store.WriteOperationStatusStaged, CreatedAtMs: 15,
	}
	operation.BaseHash = anime.HashSnapshot(operation.BaseSnapshotJSON)
	operation.DesiredHash = anime.HashSnapshot(operation.DesiredSnapshotJSON)
	seedGatewaySnapshot(t, bridgeSync.NewAnimeSnapshotStore(db), operation.AnimeID, operation.BaseSnapshotJSON, operation.BaseModifiedAt)
	if err := writeBases.Stage(ctx, operation); err != nil {
		t.Fatalf("stage replay operation: %v", err)
	}
	if err := writeBases.Finalize(ctx, operation.OperationID, 30); err != nil {
		t.Fatalf("finalize replay operation: %v", err)
	}

	published := []string{}
	publishObserved := false
	dispatchCtx, cancelDispatch := context.WithCancel(context.Background())
	markFailure := errors.New("injected crash before mark")
	failingOutbox := &markAfterPublishOutbox{
		AnimeChangedOutboxStore: writeBases,
		published:               &publishObserved,
		err:                     markFailure,
	}
	first := newGateway(t, gatewayConfig{
		db: db, clock: 40, outbox: failingOutbox,
		publishEvent: func(eventID, _ string, _ []byte) {
			publishObserved = true
			published = append(published, eventID)
			cancelDispatch()
		},
	})
	if err := first.DrainOutbox(dispatchCtx); !errors.Is(err, markFailure) {
		t.Fatalf("expected mark failure after publish, got %v", err)
	}
	if !failingOutbox.sawActiveContext || !failingOutbox.sawDeadline {
		t.Fatalf("mark did not receive independent bounded context: %#v", failingOutbox)
	}
	second := newGateway(t, gatewayConfig{
		db: db, clock: 41, outbox: writeBases,
		publishEvent: func(eventID, _ string, _ []byte) { published = append(published, eventID) },
	})
	if err := second.DrainOutbox(ctx); err != nil {
		t.Fatalf("replay pending outbox: %v", err)
	}
	if len(published) != 2 || published[0] != operation.OperationID || published[1] != operation.OperationID {
		t.Fatalf("expected at-least-once replay with stable event id, got %#v", published)
	}
}

type failFinalizeForOperationStore struct {
	store.WriteBaseStore
	failOperationID string
}

func (s *failFinalizeForOperationStore) Finalize(ctx context.Context, operationID string, committedAtMs int64) error {
	if operationID == s.failOperationID {
		return errFinalizeInjected
	}
	return s.WriteBaseStore.Finalize(ctx, operationID, committedAtMs)
}

type markAfterPublishOutbox struct {
	store.AnimeChangedOutboxStore
	published        *bool
	err              error
	sawActiveContext bool
	sawDeadline      bool
}

func (s *markAfterPublishOutbox) MarkAnimeChangedPublished(ctx context.Context, eventID string, publishedAtMs int64) error {
	s.sawActiveContext = ctx.Err() == nil
	_, s.sawDeadline = ctx.Deadline()
	if !*s.published {
		return errors.New("mark attempted before publish")
	}
	return s.err
}

// canonicalGatewayPayload canonicalizes a gateway fixture payload.
func canonicalGatewayPayload(t *testing.T, payload []byte) []byte {
	t.Helper()
	_, canonical, err := store.Decode(payload)
	if err != nil {
		t.Fatalf("canonicalize gateway payload: %v", err)
	}
	return canonical
}

// stageGatewayOperation stores a staged operation for gateway tests.
func stageGatewayOperation(t *testing.T, writeBases *bridgeSync.WriteBaseStore, operationID, animeID string, baseToken, intended int64, base, desired []byte, createdAt int64) {
	t.Helper()
	err := writeBases.Stage(context.Background(), anime.WriteOperation{
		OperationID: operationID, AnimeID: animeID,
		BaseModifiedAt: baseToken, IntendedModifiedAt: intended,
		BaseSnapshotJSON: base, BaseHash: anime.HashSnapshot(base),
		DesiredSnapshotJSON: desired, DesiredHash: anime.HashSnapshot(desired),
		Status: store.WriteOperationStatusStaged, CreatedAtMs: createdAt,
	})
	if err != nil {
		t.Fatalf("stage gateway operation %s: %v", operationID, err)
	}
}
