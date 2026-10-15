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

// fixedRoot is a library-root reader that always answers root.
func fixedRoot(root string) func(context.Context) (string, error) {
	return func(context.Context) (string, error) { return root, nil }
}

// folder returns a pointer to a stored anime folder.
func folder(path string) *string {
	return &path
}

// TestMobileAnimeQueryJoinsEpisodesAndRelativeFoldersIntoTheListAndOneAnime
// serves real stored folder shapes (ADR 027) against the root `D:\Anime\`,
// trailing separator included: nested subfolders stay whole, forward slashes
// and lower-case drives match, and a folder outside the root, a sibling that
// only shares the prefix, the root itself, or no folder at all gets no
// relative folder.
func TestMobileAnimeQueryJoinsEpisodesAndRelativeFoldersIntoTheListAndOneAnime(t *testing.T) {
	t.Parallel()

	rows := []struct {
		folder *string
		want   *string
	}{
		{folder(`D:\Anime\Overlord`), folder("Overlord")},
		{nil, nil},
		{folder(`D:\Anime\Date a Live\Date a Live II\1 Date A Bullet Dead or Bullet`), folder("Date a Live/Date a Live II/1 Date A Bullet Dead or Bullet")},
		{folder(`D:/Anime/Shokugeki no Soma/Shokugeki no Souma - Ni no Sara`), folder("Shokugeki no Soma/Shokugeki no Souma - Ni no Sara")},
		{folder(`d:\anime\Yani Neko`), folder("Yani Neko")},
		{folder(`E:\Anime\Overlord`), nil},
		{folder(`D:\Anime2\Overlord`), nil},
		{folder(`D:\Anime`), nil},
		{folder(""), nil},
		{folder(`\\NAS\Anime\Overlord`), nil},
	}
	items := make([]contracts.MobileAnime, len(rows))
	for i, row := range rows {
		items[i] = contracts.MobileAnime{ID: string(rune('a' + i)), Folder: row.folder}
	}
	durations := durationsStub{byAnime: map[string][]episodes.Duration{"a": {storedEpisode("a", 1, 24*60_000)}}}
	query := mobileAnimeQuery{durations: durations, libraryRoot: fixedRoot(`D:\Anime\`), AnimeQueryService: animeQueryStub{
		items: items,
		one:   &contracts.MobileAnime{ID: "a", Folder: folder(`D:\Anime\Overlord`)},
	}}

	got, err := query.ListMobileAnimes(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != len(rows) || len(got[0].Episodes) != 1 || got[0].Episodes[0].Minutes != 24 || got[1].Episodes != nil {
		t.Fatalf("want episodes on a only, got %+v", got)
	}
	for i, row := range rows {
		if gotRel, want := deref(got[i].FolderRelative), deref(row.want); gotRel != want || (got[i].FolderRelative == nil) != (row.want == nil) {
			t.Errorf("folder %q: folderRelative = %v, want %v", deref(row.folder), got[i].FolderRelative, row.want)
		}
	}
	one, err := query.GetMobileAnime(context.Background(), "a")
	if err != nil || one == nil || len(one.Episodes) != 1 || deref(one.FolderRelative) != "Overlord" {
		t.Fatalf("want a with its episode and relative folder, got %+v (%v)", one, err)
	}

	unset := mobileAnimeQuery{durations: durations, libraryRoot: fixedRoot(""), AnimeQueryService: animeQueryStub{items: []contracts.MobileAnime{{ID: "u", Folder: folder(`\\NAS\Anime\Overlord`)}}}}
	if got, err := unset.ListMobileAnimes(context.Background()); err != nil || got[0].FolderRelative != nil {
		t.Errorf("an unset library root must omit the relative folder, got %+v (%v)", got, err)
	}
	unreadable := mobileAnimeQuery{durations: durations, libraryRoot: func(context.Context) (string, error) {
		return `D:\Anime`, errors.New("settings closed")
	}, AnimeQueryService: animeQueryStub{items: []contracts.MobileAnime{{ID: "r", Folder: folder(`D:\Anime\Overlord`)}}}}
	if got, err := unreadable.ListMobileAnimes(context.Background()); err != nil || got[0].FolderRelative != nil {
		t.Errorf("an unreadable library root must omit the relative folder without failing, got %+v (%v)", got, err)
	}
}

// deref reads an optional string, "" when absent.
func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func TestEpisodeAnimeQueryFailsWhenTheJoinFails(t *testing.T) {
	t.Parallel()

	query := mobileAnimeQuery{durations: durationsStub{err: errors.New("closed")}, AnimeQueryService: animeQueryStub{
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
	failing := mobileAnimeQuery{durations: durationsStub{}, AnimeQueryService: animeQueryStub{err: inner}}
	if _, err := failing.ListMobileAnimes(context.Background()); !errors.Is(err, inner) {
		t.Errorf("want the inner list error, got %v", err)
	}
	if _, err := failing.GetMobileAnime(context.Background(), "a"); !errors.Is(err, inner) {
		t.Errorf("want the inner get error, got %v", err)
	}
	missing := mobileAnimeQuery{durations: durationsStub{err: errors.New("never read")}, AnimeQueryService: animeQueryStub{}}
	if one, err := missing.GetMobileAnime(context.Background(), "a"); err != nil || one != nil {
		t.Errorf("a missing anime must pass through untouched, got %+v (%v)", one, err)
	}
}

func TestEpisodeSyncTriggerJoinsEpisodesIntoEveryChangeWithASnapshot(t *testing.T) {
	t.Parallel()

	durations := durationsStub{byAnime: map[string][]episodes.Duration{"a": {storedEpisode("a", 1, 24*60_000)}}}
	changes := []contracts.AnimeChange{{ID: 1, Snapshot: &contracts.MobileAnime{ID: "a", Folder: folder(`D:\Anime\Date a Live\Date a Live II`)}}, {ID: 2, RecordID: "gone"}}
	trigger := mobileSyncTrigger{durations: durations, libraryRoot: fixedRoot(`D:\Anime`), SyncTriggerService: syncStub{changes: changes, lastID: 9}}

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
		if rel := deref(got[0].Snapshot.FolderRelative); rel != "Date a Live/Date a Live II" {
			t.Errorf("%s: want the snapshot's relative folder recomputed when served, got %q", name, rel)
		}
	}
}

func TestEpisodeSyncTriggerFailsWhenTheFeedOrTheJoinFails(t *testing.T) {
	t.Parallel()

	inner := errors.New("feed failed")
	failingFeed := mobileSyncTrigger{durations: durationsStub{}, SyncTriggerService: syncStub{err: inner, lastID: 9}}
	if got, lastID, err := failingFeed.ListChangesAfterID(context.Background(), 0); !errors.Is(err, inner) || got != nil || lastID != 0 {
		t.Errorf("want the feed error with no cursor, got %+v %d (%v)", got, lastID, err)
	}

	failingJoin := mobileSyncTrigger{durations: durationsStub{err: errors.New("closed")}, SyncTriggerService: syncStub{
		changes: []contracts.AnimeChange{{ID: 1, Snapshot: &contracts.MobileAnime{ID: "a"}}}, lastID: 9,
	}}
	if got, lastID, err := failingJoin.ListChangesSince(context.Background(), 0); err == nil || got != nil || lastID != 0 {
		t.Errorf("a failed join must fail the feed, got %+v %d (%v)", got, lastID, err)
	}
}

func TestWithEpisodeDurationsLeavesThePortsAloneWithoutADatabase(t *testing.T) {
	t.Parallel()

	query, trigger := withMobileProjection(nil, fixedRoot(""), animeQueryStub{}, syncStub{})
	if _, wrapped := query.(mobileAnimeQuery); wrapped {
		t.Error("without a database the query must not be wrapped")
	}
	if _, wrapped := trigger.(mobileSyncTrigger); wrapped {
		t.Error("without a database the feed must not be wrapped")
	}
	query, trigger = withMobileProjection(nil, nil, nil, nil)
	if query != nil || trigger != nil {
		t.Error("absent ports must stay absent")
	}
}
