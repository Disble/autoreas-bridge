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
	stageGatewayOperation(t, writeBases, stagedOperation{
		operationID: "operation-a", animeID: "anime-a", baseToken: 100, intended: 200,
		base: baseA, desired: desiredA, createdAt: 100,
	})
	stageGatewayOperation(t, writeBases, stagedOperation{
		operationID: "operation-b", animeID: "anime-b", baseToken: 100, intended: 201,
		base: baseB, desired: desiredB, createdAt: 101,
	})

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
	// cancelDispatch fires inside the publish callback below, which is the crash
	// this test injects. Deferring it would cancel the context before the dispatch
	// under test ever runs.
	dispatchCtx, cancelDispatch := context.WithCancel(context.Background()) // NOSONAR godre:S8188
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
// stagedOperation describes one staged gateway write for these tests. A struct
// rather than a parameter list (SonarQube go:S107): operationID/animeID were two
// adjacent strings, baseToken/intended two adjacent int64s, and base/desired two
// adjacent byte slices -- three separate pairs a positional call can transpose.
type stagedOperation struct {
	operationID string
	animeID     string
	baseToken   int64
	intended    int64
	base        []byte
	desired     []byte
	createdAt   int64
}

// stageGatewayOperation stores a staged operation for gateway tests.
func stageGatewayOperation(t *testing.T, writeBases *bridgeSync.WriteBaseStore, op stagedOperation) {
	t.Helper()
	err := writeBases.Stage(context.Background(), anime.WriteOperation{
		OperationID: op.operationID, AnimeID: op.animeID,
		BaseModifiedAt: op.baseToken, IntendedModifiedAt: op.intended,
		BaseSnapshotJSON: op.base, BaseHash: anime.HashSnapshot(op.base),
		DesiredSnapshotJSON: op.desired, DesiredHash: anime.HashSnapshot(op.desired),
		Status: store.WriteOperationStatusStaged, CreatedAtMs: op.createdAt,
	})
	if err != nil {
		t.Fatalf("stage gateway operation %s: %v", op.operationID, err)
	}
}

// TestDrainOutboxDeliversDerivedChangedFields proves the transport actually
// carries the derived list to the publisher. The derivation happening at the
// finalize transaction is worth nothing if the drain drops it on the way out,
// and dropping it is exactly the shape of the defect this change removes: the
// field existed on the event all along and nobody ever populated it.
func TestDrainOutboxDeliversDerivedChangedFields(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	base := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-fields", 1))
	desired := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-fields", 2))
	if err := snapshots.ReplaceBaseline(ctx, map[string]anime.SnapshotRecord{
		"anime-fields": {AnimeID: "anime-fields", CanonicalJSON: base, Hash: anime.HashSnapshot(base), ModifiedAt: 100},
	}, nil); err != nil {
		t.Fatalf("seed snapshot: %v", err)
	}
	writeBases := bridgeSync.NewWriteBaseStore(db)
	stageGatewayOperation(t, writeBases, stagedOperation{
		operationID: "operation-fields", animeID: "anime-fields", baseToken: 100, intended: 200,
		base: base, desired: desired, createdAt: 100,
	})

	delivered := map[string][]string{}
	gateway := newGateway(t, gatewayConfig{
		db: db, clock: 300,
		publishFields: func(eventID string, changedFields []string) {
			delivered[eventID] = changedFields
		},
	})
	if err := gateway.Recover(ctx); err != nil {
		t.Fatalf("recover staged operation: %v", err)
	}
	if err := gateway.DrainOutbox(ctx); err != nil {
		t.Fatalf("drain outbox: %v", err)
	}

	fields, ok := delivered["operation-fields"]
	if !ok {
		t.Fatalf("expected the drained event to be published, got %#v", delivered)
	}
	if fields == nil {
		t.Fatal("expected a non-nil changed-field list to reach the publisher")
	}
	if len(fields) == 0 {
		t.Fatal("expected the drained event to name at least one changed field, got an empty list")
	}
}
