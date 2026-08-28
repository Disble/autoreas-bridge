package anime_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

type stubEpisodeOutcomeWriter struct {
	result contracts.AnimePatchResult
	err    error
}

func (s stubEpisodeOutcomeWriter) PatchAnime(context.Context, string, contracts.AnimePatch) (contracts.AnimePatchResult, error) {
	return s.result, s.err
}

func TestEpisodeServiceRepeatAnimePropagatesOutcomeAndRecordsOnlyApplied(t *testing.T) {
	tests := []struct {
		name         string
		result       contracts.AnimePatchResult
		wantActivity int
	}{
		{
			name: "applied",
			result: contracts.AnimePatchResult{
				AnimeID: "writer-anime", Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 2000,
			},
			wantActivity: 1,
		},
		{
			name: "no op",
			result: contracts.AnimePatchResult{
				AnimeID: "writer-anime", Outcome: contracts.AnimePatchOutcomeNoOp, ModifiedAt: 1000,
			},
		},
		{
			name: "conflict",
			result: contracts.AnimePatchResult{
				AnimeID: "writer-anime", Outcome: contracts.AnimePatchOutcomeConflict, ModifiedAt: 1000, ConflictID: "conflict-7",
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := openAnimeServiceTestStore(t)
			seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":10,"status":1,"active":true}`, 1000)
			activity := &stubEpisodeActivityRecorder{}
			service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
				Query: anime.NewQueryService(store), Writer: stubEpisodeOutcomeWriter{result: test.result}, Activity: activity,
				Now: func() time.Time { return time.UnixMilli(1710000001111).UTC() },
			})

			got, err := service.RepeatAnime(context.Background(), anime.RepeatAnimeCommand{AnimeID: "anime-1", Base: new(int64(1000))})
			if err != nil {
				t.Fatalf("RepeatAnime: %v", err)
			}
			if got.AnimeID != test.result.AnimeID || got.Outcome != test.result.Outcome || got.ModifiedAt != test.result.ModifiedAt || got.ConflictID != test.result.ConflictID {
				t.Fatalf("result = %#v, want writer fields from %#v", got, test.result)
			}
			if len(activity.records) != test.wantActivity {
				t.Fatalf("activity records = %d, want %d for outcome %q", len(activity.records), test.wantActivity, test.result.Outcome)
			}
		})
	}
}

func TestEpisodeServiceRepeatAnimeFailureReturnsNoAppliedResultOrActivity(t *testing.T) {
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":10,"status":1,"active":true}`, 1000)
	writeErr := errors.New("gateway unavailable")
	activity := &stubEpisodeActivityRecorder{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query: anime.NewQueryService(store), Writer: stubEpisodeOutcomeWriter{err: writeErr}, Activity: activity,
	})

	got, err := service.RepeatAnime(context.Background(), anime.RepeatAnimeCommand{AnimeID: "anime-1", Base: new(int64(1000))})
	if !errors.Is(err, writeErr) {
		t.Fatalf("RepeatAnime error = %v, want %v", err, writeErr)
	}
	if got != (anime.EpisodeCommandResult{}) {
		t.Fatalf("failure result = %#v, want zero value", got)
	}
	if len(activity.records) != 0 {
		t.Fatalf("failure recorded %d activities, want zero", len(activity.records))
	}
}
