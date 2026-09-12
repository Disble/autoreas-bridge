package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

type stubActivityOutcomeWriter struct {
	result contracts.AnimePatchResult
	err    error
}

func (s stubActivityOutcomeWriter) PatchAnime(context.Context, string, contracts.AnimePatch) (contracts.AnimePatchResult, error) {
	return s.result, s.err
}

// stubWatchRecorder is the anime.WatchRecorder test double shared by the
// desktop package's watch-history wiring tests.
type stubWatchRecorder struct {
	calls []watchhistory.Change
	err   error
}

func (s *stubWatchRecorder) RecordWatch(_ context.Context, change watchhistory.Change) error {
	s.calls = append(s.calls, change)
	return s.err
}

func TestActivityAnimeWriteServiceRecordsMobilePatch(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":1,"status":0,"active":true}`, 1000)

	writer := anime.NewWriteService(store, &stubAppUpdateWriter{})
	recorder := activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(db))}
	watchRecorder := &stubWatchRecorder{}
	service := activityAnimeWriteService{
		query:         anime.NewQueryService(store),
		writer:        writer,
		recorder:      recorder,
		watchRecorder: watchRecorder,
		source:        anime.ActivitySourceMobile,
		now:           func() int64 { return 1710000000123 },
	}

	progress := 2.0
	base := int64(1000)
	if _, err := service.PatchAnime(ctx, "anime-1", contracts.AnimePatch{NroCapVisto: &progress, Base: &base}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity rows: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 mobile activity row, got %#v", records)
	}
	if records[0].Source != activity.SourceMobile || records[0].ActionType != activity.ActionEpisodeAdjusted {
		t.Fatalf("unexpected mobile activity row: %#v", records[0])
	}

	if len(watchRecorder.calls) != 1 {
		t.Fatalf("expected 1 watch history record, got %d", len(watchRecorder.calls))
	}
	change := watchRecorder.calls[0]
	if change.AnimeID != "anime-1" || change.AnimeName != "Frieren" || change.Source != anime.ActivitySourceMobile ||
		change.BeforeEpisodes != 1 || change.AfterEpisodes != 2 || change.Cycle != 1 || change.OccurredAtMS != 1710000000123 || change.CycleReset {
		t.Fatalf("unexpected watch history change: %#v", change)
	}
}

func TestActivityAnimeWriteServiceRecordsMobileSoftDelete(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":1,"status":0,"active":true}`, 1000)

	writer := anime.NewWriteService(store, &stubAppUpdateWriter{})
	recorder := activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(db))}
	service := activityAnimeWriteService{
		query:    anime.NewQueryService(store),
		writer:   writer,
		recorder: recorder,
		source:   anime.ActivitySourceMobile,
		now:      func() int64 { return 1710000000123 },
	}

	active := false
	deletedAt := int64(1710000000123)
	base := int64(1000)
	if _, err := service.PatchAnime(ctx, "anime-1", contracts.AnimePatch{
		Activo:              &active,
		FechaEliminacion:    &deletedAt,
		PreserveLastWatched: true,
		Base:                &base,
	}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity rows: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 mobile activity row, got %#v", records)
	}
	if records[0].Source != activity.SourceMobile || records[0].ActionType != activity.ActionAnimeSoftDeleted {
		t.Fatalf("unexpected mobile activity row: %#v", records[0])
	}
}

func TestActivityAnimeWriteServiceRecordsMobileRepeat(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":10.5,"status":1,"active":false,"createdAt":1600000000000}`, 1000)

	writer := anime.NewWriteService(store, &stubAppUpdateWriter{})
	recorder := activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(db))}
	watchRecorder := &stubWatchRecorder{}
	service := activityAnimeWriteService{
		query:         anime.NewQueryService(store),
		writer:        writer,
		recorder:      recorder,
		watchRecorder: watchRecorder,
		source:        anime.ActivitySourceMobile,
		now:           func() int64 { return 1710000000123 },
	}

	repeatAt := int64(1710000000123)
	base := int64(1000)
	if _, err := service.PatchAnime(ctx, "anime-1", contracts.AnimePatch{
		RepeatAt:            &repeatAt,
		PreserveLastWatched: true,
		Base:                &base,
	}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity rows: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 mobile activity row, got %#v", records)
	}
	if records[0].Source != activity.SourceMobile || records[0].ActionType != activity.ActionAnimeRepeated {
		t.Fatalf("unexpected mobile activity row: %#v", records[0])
	}
	var before anime.ActivityAnimeSnapshot
	if err := json.Unmarshal(records[0].BeforeJSON, &before); err != nil {
		t.Fatalf("unmarshal before snapshot: %v", err)
	}
	var after anime.ActivityAnimeSnapshot
	if err := json.Unmarshal(records[0].AfterJSON, &after); err != nil {
		t.Fatalf("unmarshal after snapshot: %v", err)
	}
	if before.NroCapVisto != 10.5 || before.Estado != 1 || before.Activo != 0 {
		t.Fatalf("expected repeat before snapshot to keep prior cycle, got %#v", before)
	}
	if after.NroCapVisto != 0 || after.Estado != 0 || after.Activo != 1 {
		t.Fatalf("expected repeat after snapshot to reset cycle, got %#v", after)
	}

	if len(watchRecorder.calls) != 1 || !watchRecorder.calls[0].CycleReset {
		t.Fatalf("expected 1 watch history record with CycleReset true, got %#v", watchRecorder.calls)
	}
}

func TestActivityAnimeWriteServiceRecordsOnlyAppliedOutcomes(t *testing.T) {
	writeErr := errors.New("persistence failed")
	tests := []struct {
		name    string
		result  contracts.AnimePatchResult
		err     error
		wantErr error
	}{
		{name: "no op", result: contracts.AnimePatchResult{AnimeID: "anime-1", Outcome: contracts.AnimePatchOutcomeNoOp, ModifiedAt: 1000}},
		{name: "conflict", result: contracts.AnimePatchResult{AnimeID: "anime-1", Outcome: contracts.AnimePatchOutcomeConflict, ModifiedAt: 1000, ConflictID: "conflict-9"}},
		{name: "error", err: writeErr, wantErr: writeErr},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			db := openRuntimeBridgeDB(t)
			store := bridgeSync.NewAnimeSnapshotStore(db)
			seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":1,"status":0,"active":true}`, 1000)
			watchRecorder := &stubWatchRecorder{}
			service := activityAnimeWriteService{
				query: anime.NewQueryService(store), writer: stubActivityOutcomeWriter{result: test.result, err: test.err},
				recorder:      activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(db))},
				watchRecorder: watchRecorder,
				source:        anime.ActivitySourceMobile, now: func() int64 { return 1710000000123 },
			}
			progress := 2.0

			got, err := service.PatchAnime(ctx, "anime-1", contracts.AnimePatch{NroCapVisto: &progress})
			assertActivityPatchOutcome(t, got, err, test.result, test.wantErr)

			records, listErr := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(ctx, activity.ListQuery{Limit: 10})
			if listErr != nil {
				t.Fatalf("list activity rows: %v", listErr)
			}
			if len(records) != 0 {
				t.Fatalf("outcome %q recorded activity: %#v", test.result.Outcome, records)
			}
			if len(watchRecorder.calls) != 0 {
				t.Fatalf("outcome %q recorded watch history: %#v", test.result.Outcome, watchRecorder.calls)
			}
		})
	}
}

// TestActivityAnimeWriteServiceOccurredAtMsDefaultsToZeroWithNoClockWired
// asserts occurredAtMs's nil-clock fallback directly: kept as a white-box
// call on the unexported method (same package) rather than a full PatchAnime
// integration test, since the D4 record-or-degrade guard itself is now
// proven once in internal/anime's table, and occurredAtMs's return value
// flows straight through with no later guard that could mask this mutant.
func TestActivityAnimeWriteServiceOccurredAtMsDefaultsToZeroWithNoClockWired(t *testing.T) {
	service := activityAnimeWriteService{}
	if got := service.occurredAtMs(); got != 0 {
		t.Fatalf("expected occurredAtMs to default to zero with no clock wired, got %d", got)
	}
}

// assertActivityPatchOutcome verifies a patch result and its expected error.
func assertActivityPatchOutcome(t *testing.T, got contracts.AnimePatchResult, err error, want contracts.AnimePatchResult, wantErr error) {
	t.Helper()
	if wantErr != nil {
		if !errors.Is(err, wantErr) {
			t.Fatalf("PatchAnime error = %v, want %v", err, wantErr)
		}
		if got != (contracts.AnimePatchResult{}) {
			t.Fatalf("failure result = %#v, want zero value", got)
		}
		return
	}
	if err != nil {
		t.Fatalf("PatchAnime: %v", err)
	}
	if got != want {
		t.Fatalf("result = %#v, want %#v", got, want)
	}
}
