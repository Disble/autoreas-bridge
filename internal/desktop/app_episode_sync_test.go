package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
)

// durationsStub answers the join from a fixed map, or fails.
type durationsStub struct {
	byAnime map[string][]episodes.Duration
	err     error
}

func (d durationsStub) ByAnimeIDs(context.Context, []string) (map[string][]episodes.Duration, error) {
	return d.byAnime, d.err
}

// animeQueryStub serves fixed Mobile anime; every other method panics through the nil interface.
type animeQueryStub struct {
	contracts.AnimeQueryService
	items []contracts.MobileAnime
	one   *contracts.MobileAnime
	err   error
}

func (q animeQueryStub) ListMobileAnimes(context.Context) ([]contracts.MobileAnime, error) {
	return q.items, q.err
}

func (q animeQueryStub) GetMobileAnime(context.Context, string) (*contracts.MobileAnime, error) {
	return q.one, q.err
}

// syncStub serves fixed changes.
type syncStub struct {
	contracts.SyncTriggerService
	changes []contracts.AnimeChange
	lastID  int64
	err     error
}

func (s syncStub) ListChangesSince(context.Context, int64) ([]contracts.AnimeChange, int64, error) {
	return s.changes, s.lastID, s.err
}

func (s syncStub) ListChangesAfterID(context.Context, int64) ([]contracts.AnimeChange, int64, error) {
	return s.changes, s.lastID, s.err
}

// storedEpisode is one stored measured duration.
func storedEpisode(animeID string, episode int, ms int64) episodes.Duration {
	return episodes.Duration{AnimeID: animeID, Episode: episode, DurationMS: ms, Source: episodes.SourceMeasured}
}

func TestEpisodeAnimeQueryJoinsEpisodesIntoTheListAndOneAnime(t *testing.T) {
	t.Parallel()

	durations := durationsStub{byAnime: map[string][]episodes.Duration{"a": {storedEpisode("a", 1, 24*60_000)}}}
	query := episodeAnimeQuery{durations: durations, AnimeQueryService: animeQueryStub{
		items: []contracts.MobileAnime{{ID: "a"}, {ID: "b"}},
		one:   &contracts.MobileAnime{ID: "a"},
	}}

	items, err := query.ListMobileAnimes(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 2 || len(items[0].Episodes) != 1 || items[0].Episodes[0].Minutes != 24 || items[1].Episodes != nil {
		t.Fatalf("want episodes on a only, got %+v", items)
	}
	one, err := query.GetMobileAnime(context.Background(), "a")
	if err != nil || one == nil || len(one.Episodes) != 1 {
		t.Fatalf("want a with its episode, got %+v (%v)", one, err)
	}
}

func TestEpisodeAnimeQueryFailsWhenTheJoinFails(t *testing.T) {
	t.Parallel()

	query := episodeAnimeQuery{durations: durationsStub{err: errors.New("closed")}, AnimeQueryService: animeQueryStub{
		items: []contracts.MobileAnime{{ID: "a"}},
		one:   &contracts.MobileAnime{ID: "a"},
	}}

	if items, err := query.ListMobileAnimes(context.Background()); err == nil || items != nil {
		t.Errorf("a failed join must fail the list, got %+v (%v)", items, err)
	}
	if one, err := query.GetMobileAnime(context.Background(), "a"); err == nil || one != nil {
		t.Errorf("a failed join must fail the anime, got %+v (%v)", one, err)
	}
}

func TestEpisodeAnimeQueryPassesInnerFailuresAndMissesThrough(t *testing.T) {
	t.Parallel()

	inner := errors.New("query failed")
	failing := episodeAnimeQuery{durations: durationsStub{}, AnimeQueryService: animeQueryStub{err: inner}}
	if _, err := failing.ListMobileAnimes(context.Background()); !errors.Is(err, inner) {
		t.Errorf("want the inner list error, got %v", err)
	}
	if _, err := failing.GetMobileAnime(context.Background(), "a"); !errors.Is(err, inner) {
		t.Errorf("want the inner get error, got %v", err)
	}
	missing := episodeAnimeQuery{durations: durationsStub{err: errors.New("never read")}, AnimeQueryService: animeQueryStub{}}
	if one, err := missing.GetMobileAnime(context.Background(), "a"); err != nil || one != nil {
		t.Errorf("a missing anime must pass through untouched, got %+v (%v)", one, err)
	}
}

func TestEpisodeSyncTriggerJoinsEpisodesIntoEveryChangeWithASnapshot(t *testing.T) {
	t.Parallel()

	durations := durationsStub{byAnime: map[string][]episodes.Duration{"a": {storedEpisode("a", 1, 24*60_000)}}}
	changes := []contracts.AnimeChange{{ID: 1, Snapshot: &contracts.MobileAnime{ID: "a"}}, {ID: 2, RecordID: "gone"}}
	trigger := episodeSyncTrigger{durations: durations, SyncTriggerService: syncStub{changes: changes, lastID: 9}}

	for name, list := range map[string]func() ([]contracts.AnimeChange, int64, error){
		"since": func() ([]contracts.AnimeChange, int64, error) {
			return trigger.ListChangesSince(context.Background(), 0)
		},
		"after id": func() ([]contracts.AnimeChange, int64, error) {
			return trigger.ListChangesAfterID(context.Background(), 0)
		},
	} {
		got, lastID, err := list()
		if err != nil || lastID != 9 || len(got) != 2 {
			t.Fatalf("%s: want both changes and cursor 9, got %+v %d (%v)", name, got, lastID, err)
		}
		if len(got[0].Snapshot.Episodes) != 1 || got[1].Snapshot != nil {
			t.Errorf("%s: want episodes joined into the snapshot only, got %+v", name, got)
		}
	}
}

func TestEpisodeSyncTriggerFailsWhenTheFeedOrTheJoinFails(t *testing.T) {
	t.Parallel()

	inner := errors.New("feed failed")
	failingFeed := episodeSyncTrigger{durations: durationsStub{}, SyncTriggerService: syncStub{err: inner, lastID: 9}}
	if got, lastID, err := failingFeed.ListChangesAfterID(context.Background(), 0); !errors.Is(err, inner) || got != nil || lastID != 0 {
		t.Errorf("want the feed error with no cursor, got %+v %d (%v)", got, lastID, err)
	}

	failingJoin := episodeSyncTrigger{durations: durationsStub{err: errors.New("closed")}, SyncTriggerService: syncStub{
		changes: []contracts.AnimeChange{{ID: 1, Snapshot: &contracts.MobileAnime{ID: "a"}}}, lastID: 9,
	}}
	if got, lastID, err := failingJoin.ListChangesSince(context.Background(), 0); err == nil || got != nil || lastID != 0 {
		t.Errorf("a failed join must fail the feed, got %+v %d (%v)", got, lastID, err)
	}
}

func TestWithEpisodeDurationsLeavesThePortsAloneWithoutADatabase(t *testing.T) {
	t.Parallel()

	query, trigger := withEpisodeDurations(nil, animeQueryStub{}, syncStub{})
	if _, wrapped := query.(episodeAnimeQuery); wrapped {
		t.Error("without a database the query must not be wrapped")
	}
	if _, wrapped := trigger.(episodeSyncTrigger); wrapped {
		t.Error("without a database the feed must not be wrapped")
	}
	query, trigger = withEpisodeDurations(nil, nil, nil)
	if query != nil || trigger != nil {
		t.Error("absent ports must stay absent")
	}
}
