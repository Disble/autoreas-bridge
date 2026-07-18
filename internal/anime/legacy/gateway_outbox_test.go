package legacy_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestGatewayDefiniteAppendFailureCleansUpWithIndependentBoundedContext(t *testing.T) {
	for _, tt := range []struct {
		name          string
		abortErr      error
		wantRemaining int
	}{
		{name: "cleanup succeeds", wantRemaining: 0},
		{name: "cleanup failure is surfaced", abortErr: errors.New("injected abort failure"), wantRemaining: 1},
	} {
		t.Run(tt.name, func(t *testing.T) { runGatewayDefiniteAppendFailureScenario(t, tt.abortErr, tt.wantRemaining) })
	}
}

// runGatewayDefiniteAppendFailureScenario exercises append failure cleanup behavior.
func runGatewayDefiniteAppendFailureScenario(t *testing.T, abortErr error, wantRemaining int) {
	t.Helper()

	db := openGatewayDB(t)
	store := bridgeSync.NewWriteBaseStore(db)
	tracking := &abortTrackingStore{WriteBaseStore: store, abortErr: abortErr}
	seedGatewaySnapshot(t, bridgeSync.NewAnimeSnapshotStore(db), "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	requestCtx, cancelRequest := context.WithCancel(context.Background())
	base := int64(100)
	gateway := newGateway(t, gatewayConfig{
		db:         db,
		path:       writeGatewayData(t, gatewayAnimeJSON("anime-1", 2)),
		clock:      200,
		operations: tracking,
		append: func(context.Context, string, []byte) error {
			cancelRequest()
			return legacy.NewDefiniteAppendError(requestCtx.Err())
		},
	})

	_, err := gateway.Update(requestCtx, legacy.UpdateCommand{
		AnimeID: "anime-1",
		Base:    &base,
		Mutate:  func(value *domain.Anime) { value.SetProgress(3) },
	})
	assertGatewayDefiniteAppendFailure(t, err, abortErr)
	assertGatewayAbortContext(t, tracking)
	assertGatewayRemainingStagedOperations(t, store, wantRemaining)
}

// assertGatewayDefiniteAppendFailure verifies the propagated append and abort errors.
func assertGatewayDefiniteAppendFailure(t *testing.T, err error, abortErr error) {
	t.Helper()

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected canceled append error, got %v", err)
	}
	if abortErr != nil && !errors.Is(err, abortErr) {
		t.Fatalf("expected abort failure to be joined, got %v", err)
	}
}

// assertGatewayAbortContext verifies that abort receives a bounded active context.
func assertGatewayAbortContext(t *testing.T, tracking *abortTrackingStore) {
	t.Helper()

	if !tracking.sawActiveContext || !tracking.sawDeadline {
		t.Fatalf("abort did not receive independent bounded context: %#v", tracking)
	}
}

// assertGatewayRemainingStagedOperations verifies staged-operation cleanup.
func assertGatewayRemainingStagedOperations(t *testing.T, store *bridgeSync.WriteBaseStore, wantRemaining int) {
	t.Helper()

	staged, err := store.ListStaged(context.Background())
	if err != nil || len(staged) != wantRemaining {
		t.Fatalf("unexpected staged operations after cleanup: %#v, %v", staged, err)
	}
}

func TestGatewayRecoveryTreatsMissingSyntheticCreateBaseAsRetryable(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	dataPath := filepath.Join(t.TempDir(), "animes.dat")
	if err := os.WriteFile(dataPath, nil, 0o600); err != nil {
		t.Fatalf("create empty Legacy file: %v", err)
	}
	var raw legacy.AnimeRaw
	if err := json.Unmarshal(gatewayAnimeJSON("anime-create", 0), &raw); err != nil {
		t.Fatalf("decode create fixture: %v", err)
	}
	first := newGateway(t, gatewayConfig{
		db: db, path: dataPath, clock: 100, operationID: "operation-create",
		append: func(context.Context, string, []byte) error {
			return legacy.NewAmbiguousAppendError(errors.New("append acknowledgment lost"))
		},
	})
	if _, err := first.Create(ctx, raw); !legacy.IsAmbiguousAppendError(err) {
		t.Fatalf("expected ambiguous Create append, got %v", err)
	}

	restarted := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 101})
	if err := restarted.Recover(ctx); err != nil {
		t.Fatalf("recover missing staged Create: %v", err)
	}
	if countGatewayLines(t, dataPath) != 1 {
		t.Fatalf("expected Create recovery to append exactly once")
	}
	pending, err := bridgeSync.NewWriteBaseStore(db).ListPendingAnimeChanged(ctx)
	if err != nil || len(pending) != 1 || pending[0].EventID != "operation-create" {
		t.Fatalf("expected finalized Create outbox event: %#v, %v", pending, err)
	}
}

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
	dataPath := writeGatewayData(t, desiredA)
	if err := appendGatewayLine(dataPath, baseB); err != nil {
		t.Fatalf("append second recovery base: %v", err)
	}
	store := bridgeSync.NewWriteBaseStore(db)
	stageGatewayOperation(t, store, "operation-a", "anime-a", 100, 200, baseA, desiredA, 100)
	stageGatewayOperation(t, store, "operation-b", "anime-b", 100, 201, baseB, desiredB, 101)

	first := newGateway(t, gatewayConfig{
		db: db, path: dataPath, clock: 300,
		append: func(context.Context, string, []byte) error {
			return legacy.NewAmbiguousAppendError(errors.New("second recovery interrupted"))
		},
	})
	if err := first.Recover(ctx); !legacy.IsAmbiguousAppendError(err) {
		t.Fatalf("expected second recovery failure, got %v", err)
	}
	pending, err := store.ListPendingAnimeChanged(ctx)
	if err != nil || len(pending) != 1 || pending[0].EventID != "operation-a" {
		t.Fatalf("first committed recovery was not durable: %#v, %v", pending, err)
	}

	published := []string{}
	second := newGateway(t, gatewayConfig{
		db: db, path: dataPath, clock: 301,
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
	store := bridgeSync.NewWriteBaseStore(db)
	operation := anime.WriteOperation{
		OperationID: "operation-replay", AnimeID: "anime-replay",
		BaseModifiedAt: 10, IntendedModifiedAt: 20,
		BaseSnapshotJSON:    canonicalGatewayPayload(t, gatewayAnimeJSON("anime-replay", 1)),
		DesiredSnapshotJSON: canonicalGatewayPayload(t, gatewayAnimeJSON("anime-replay", 2)),
		Status:              legacy.WriteOperationStatusStaged, CreatedAtMs: 15,
	}
	operation.BaseHash = anime.HashSnapshot(operation.BaseSnapshotJSON)
	operation.DesiredHash = anime.HashSnapshot(operation.DesiredSnapshotJSON)
	seedGatewaySnapshot(t, bridgeSync.NewAnimeSnapshotStore(db), operation.AnimeID, operation.BaseSnapshotJSON, operation.BaseModifiedAt)
	if err := store.Stage(ctx, operation); err != nil {
		t.Fatalf("stage replay operation: %v", err)
	}
	if err := store.Finalize(ctx, operation.OperationID, 30); err != nil {
		t.Fatalf("finalize replay operation: %v", err)
	}

	published := []string{}
	publishObserved := false
	dispatchCtx, cancelDispatch := context.WithCancel(context.Background())
	markFailure := errors.New("injected crash before mark")
	failingOutbox := &markAfterPublishOutbox{
		AnimeChangedOutboxStore: store,
		published:               &publishObserved,
		err:                     markFailure,
	}
	first := newGateway(t, gatewayConfig{
		db: db, path: writeGatewayData(t, operation.DesiredSnapshotJSON), clock: 40, outbox: failingOutbox,
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
		db: db, clock: 41, outbox: store,
		publishEvent: func(eventID, _ string, _ []byte) { published = append(published, eventID) },
	})
	if err := second.DrainOutbox(ctx); err != nil {
		t.Fatalf("replay pending outbox: %v", err)
	}
	if len(published) != 2 || published[0] != operation.OperationID || published[1] != operation.OperationID {
		t.Fatalf("expected at-least-once replay with stable event id, got %#v", published)
	}
}

type abortTrackingStore struct {
	legacy.WriteBaseStore
	abortErr         error
	sawActiveContext bool
	sawDeadline      bool
}

func (s *abortTrackingStore) Abort(ctx context.Context, operationID string) error {
	s.sawActiveContext = ctx.Err() == nil
	_, s.sawDeadline = ctx.Deadline()
	if s.abortErr != nil {
		return s.abortErr
	}
	return s.WriteBaseStore.Abort(ctx, operationID)
}

type markAfterPublishOutbox struct {
	legacy.AnimeChangedOutboxStore
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
	_, canonical, err := legacy.Decode(payload)
	if err != nil {
		t.Fatalf("canonicalize gateway payload: %v", err)
	}
	return canonical
}

// stageGatewayOperation stores a staged operation for gateway tests.
func stageGatewayOperation(t *testing.T, store *bridgeSync.WriteBaseStore, operationID, animeID string, baseToken, intended int64, base, desired []byte, createdAt int64) {
	t.Helper()
	err := store.Stage(context.Background(), anime.WriteOperation{
		OperationID: operationID, AnimeID: animeID,
		BaseModifiedAt: baseToken, IntendedModifiedAt: intended,
		BaseSnapshotJSON: base, BaseHash: anime.HashSnapshot(base),
		DesiredSnapshotJSON: desired, DesiredHash: anime.HashSnapshot(desired),
		Status: legacy.WriteOperationStatusStaged, CreatedAtMs: createdAt,
	})
	if err != nil {
		t.Fatalf("stage gateway operation %s: %v", operationID, err)
	}
}
