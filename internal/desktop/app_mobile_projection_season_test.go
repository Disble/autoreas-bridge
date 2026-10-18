package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/season/domain"
	bridgeSync "autoreas-bridge/internal/sync"
)

// candidacies is a season projection source answering fixed candidacies, or failing.
func candidacies(err error, values ...bridgeSync.SeasonCandidacy) bridgeSync.SeasonProjectionSource {
	return func(context.Context) ([]bridgeSync.SeasonCandidacy, error) { return values, err }
}

// gradeOf returns a pointer to g.
func gradeOf(g int) *int { return &g }

// assertSeason fails unless item carries want (nil = no season).
func assertSeason(t *testing.T, item contracts.MobileAnime, want *contracts.MobileAnimeSeason) {
	t.Helper()

	got := item.Season
	if (got == nil) != (want == nil) {
		t.Fatalf("season of %s = %+v, want %+v", item.ID, got, want)
	}
	if got == nil {
		return
	}
	if got.SeasonID != want.SeasonID || (got.Grade == nil) != (want.Grade == nil) || (got.Grade != nil && *got.Grade != *want.Grade) {
		t.Fatalf("season of %s = {%s %v}, want {%s %v}", item.ID, got.SeasonID, got.Grade, want.SeasonID, want.Grade)
	}
}

func TestMobileAnimeQueryJoinsTheSeasonCandidacyIntoTheListAndOneAnime(t *testing.T) {
	t.Parallel()

	source := []bridgeSync.SeasonCandidacy{{AnimeID: "a", SeasonID: "s1", Grade: gradeOf(4)}, {AnimeID: "b", SeasonID: "s1"}}
	stale := &contracts.MobileAnimeSeason{SeasonID: "old"}
	query := mobileAnimeQuery{durations: durationsStub{}, seasons: candidacies(nil, source...), AnimeQueryService: animeQueryStub{
		items: []contracts.MobileAnime{{ID: "a"}, {ID: "b"}, {ID: "c", Season: stale}},
		one:   &contracts.MobileAnime{ID: "b"},
	}}

	got, err := query.ListMobileAnimes(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	assertSeason(t, got[0], &contracts.MobileAnimeSeason{SeasonID: "s1", Grade: gradeOf(4)})
	assertSeason(t, got[1], &contracts.MobileAnimeSeason{SeasonID: "s1"})
	assertSeason(t, got[2], nil)
	*source[0].Grade = 6
	if *got[0].Season.Grade != 4 {
		t.Fatal("the served grade aliases the projection's grade")
	}
	one, err := query.GetMobileAnime(context.Background(), "b")
	if err != nil || one == nil {
		t.Fatalf("get: %+v (%v)", one, err)
	}
	assertSeason(t, *one, &contracts.MobileAnimeSeason{SeasonID: "s1"})
}

func TestMobileSyncTriggerJoinsTheSeasonCandidacyIntoEveryChangeWithASnapshot(t *testing.T) {
	t.Parallel()

	trigger := mobileSyncTrigger{durations: durationsStub{}, seasons: candidacies(nil, bridgeSync.SeasonCandidacy{AnimeID: "a", SeasonID: "s1", Grade: gradeOf(2)}), SyncTriggerService: syncStub{
		changes: []contracts.AnimeChange{{RecordID: "a", Snapshot: &contracts.MobileAnime{ID: "a"}}, {RecordID: "d"}, {RecordID: "b", Snapshot: &contracts.MobileAnime{ID: "b"}}},
		lastID:  9,
	}}

	for name, list := range map[string]func() ([]contracts.AnimeChange, int64, error){
		"after id": func() ([]contracts.AnimeChange, int64, error) {
			return trigger.ListChangesAfterID(context.Background(), 0)
		},
		"since": func() ([]contracts.AnimeChange, int64, error) {
			return trigger.ListChangesSince(context.Background(), 0)
		},
	} {
		changes, lastID, err := list()
		if err != nil || lastID != 9 || len(changes) != 3 {
			t.Fatalf("%s: %d changes, last %d (%v)", name, len(changes), lastID, err)
		}
		assertSeason(t, *changes[0].Snapshot, &contracts.MobileAnimeSeason{SeasonID: "s1", Grade: gradeOf(2)})
		assertSeason(t, *changes[2].Snapshot, nil)
	}
}

func TestMobileProjectionFailsWhenTheSeasonCannotBeRead(t *testing.T) {
	t.Parallel()

	failing := candidacies(errors.New("season store down"))
	query := mobileAnimeQuery{durations: durationsStub{}, seasons: failing, AnimeQueryService: animeQueryStub{
		items: []contracts.MobileAnime{{ID: "a"}}, one: &contracts.MobileAnime{ID: "a"},
	}}
	trigger := mobileSyncTrigger{durations: durationsStub{}, seasons: failing, SyncTriggerService: syncStub{
		changes: []contracts.AnimeChange{{RecordID: "a", Snapshot: &contracts.MobileAnime{ID: "a"}}},
	}}

	if items, err := query.ListMobileAnimes(context.Background()); err == nil || items != nil {
		t.Fatalf("list served %+v on a failed season read", items)
	}
	if item, err := query.GetMobileAnime(context.Background(), "a"); err == nil || item != nil {
		t.Fatalf("get served %+v on a failed season read", item)
	}
	if changes, _, err := trigger.ListChangesAfterID(context.Background(), 0); err == nil || changes != nil {
		t.Fatalf("feed served %+v on a failed season read", changes)
	}
}

func TestSeasonCandidaciesKeepsLinkedRowsWithTheirGradeOnceGraded(t *testing.T) {
	t.Parallel()

	got := seasonCandidacies("s1", []domain.SeasonAnime{
		{AnimeID: "a", Grade: 5},
		{AnimeID: ""},
		{AnimeID: "b", Grade: 0},
		{AnimeID: "c", Grade: 1},
	})

	want := []bridgeSync.SeasonCandidacy{{AnimeID: "a", SeasonID: "s1", Grade: gradeOf(5)}, {AnimeID: "b", SeasonID: "s1"}, {AnimeID: "c", SeasonID: "s1", Grade: gradeOf(1)}}
	if len(got) != len(want) {
		t.Fatalf("candidacies = %+v, want %+v", got, want)
	}
	for i := range want {
		assertSeason(t, contracts.MobileAnime{ID: got[i].AnimeID, Season: &contracts.MobileAnimeSeason{SeasonID: got[i].SeasonID, Grade: got[i].Grade}},
			&contracts.MobileAnimeSeason{SeasonID: want[i].SeasonID, Grade: want[i].Grade})
		if got[i].AnimeID != want[i].AnimeID {
			t.Fatalf("candidacy %d is %s, want %s", i, got[i].AnimeID, want[i].AnimeID)
		}
	}
}
