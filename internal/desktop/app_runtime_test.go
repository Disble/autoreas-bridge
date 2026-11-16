package desktop

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/notification/center"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

// animeApp returns an App whose anime handle serves services, in the given module state.
func animeApp(services animeServices, state lifecycle.State) *App {
	app := &App{ctx: context.Background()}
	app.moduleSet().anime.Bind(services)
	switch state {
	case lifecycle.StateReady:
		_ = app.moduleSet().writer.MarkReady(moduleAnime)
	case lifecycle.StateFailed:
		_ = app.moduleSet().writer.MarkFailed(moduleAnime, "bridge database failed to open: locked")
	}
	return app
}

// readyAnimeApp returns an App whose ready anime handle serves services.
func readyAnimeApp(services animeServices) *App {
	return animeApp(services, lifecycle.StateReady)
}

// assertAnimeFailure checks a read failed with wantCode and wantMsg and answered its zero value.
func assertAnimeFailure(t *testing.T, value any, err error, wantCode apperr.Code, wantMsg string) {
	t.Helper()
	code, _ := apperr.CodeOf(err)
	if code != wantCode || err.Error() != wantMsg {
		t.Fatalf("err = %v (code %q), want code %q and message %q", err, code, wantCode, wantMsg)
	}
	if !reflect.ValueOf(value).IsZero() {
		t.Fatalf("a failed read answered %#v, want its zero value", value)
	}
}

// animeReads calls each anime read binding that runs through the handle.
var animeReads = []struct {
	name string
	call func(*App) (any, error)
}{
	{"GetAnimes", func(a *App) (any, error) { return a.GetAnimes() }},
	{"GetAnimeDetail", func(a *App) (any, error) { return a.GetAnimeDetail("anime-1") }},
	{"GetAnimeDetailView", func(a *App) (any, error) { return a.GetAnimeDetailView("anime-1") }},
	{"GetWatchHistoryPage", func(a *App) (any, error) {
		return a.GetWatchHistoryPage(contracts.WatchHistoryPageRequest{})
	}},
	{"GetAnimeWatchHistoryPage", func(a *App) (any, error) {
		return a.GetAnimeWatchHistoryPage(contracts.AnimeWatchHistoryPageRequest{AnimeID: "anime-1"})
	}},
	{"GetAnimeCover", func(a *App) (any, error) { return a.GetAnimeCover("anime-1") }},
	{"PreviewAnimeCover", func(a *App) (any, error) { return a.PreviewAnimeCover("D:/a.jpg") }},
}

// TestAnimeReadsFollowTheAnimeModule pins S1 for the anime reads: none of them answers an empty
// catalog, a nil detail, an error-status page or a placeholder cover while the module starts or
// after it failed.
func TestAnimeReadsFollowTheAnimeModule(t *testing.T) {
	t.Parallel()
	url := "https://cdn.example.com/cover.jpg"
	services := animeServices{
		query:        &stubAnimeQueryService{mobileAnime: &contracts.MobileAnime{ID: "anime-1", Cover: &url}},
		watchHistory: &stubWatchHistoryQuery{},
		covers:       stubCoverThumbnails{result: coverResult()},
	}
	cases := []struct {
		name     string
		state    lifecycle.State
		wantCode apperr.Code
		wantMsg  string
	}{
		{"starting is unavailable", lifecycle.StateStarting, apperr.CodeUnavailable, "anime is starting"},
		{"failed is a failed precondition", lifecycle.StateFailed, apperr.CodeFailedPrecondition, "bridge database failed to open: locked"},
	}
	for _, read := range animeReads {
		for _, tc := range cases {
			t.Run(read.name+"/"+tc.name, func(t *testing.T) {
				t.Parallel()
				value, err := read.call(animeApp(services, tc.state))

				assertAnimeFailure(t, value, err, tc.wantCode, tc.wantMsg)
			})
		}
	}
}

// TestAnimeReadsMapTheirFailures pins each ready read's failure codes: an unknown anime is
// not_found, a bad order is invalid_argument, any other service error is internal.
func TestAnimeReadsMapTheirFailures(t *testing.T) {
	t.Parallel()
	down := errors.New("snapshot read failed")
	queryFails := animeServices{query: &stubAnimeQueryService{err: down}, watchHistory: &stubWatchHistoryQuery{err: down}}
	notFound := animeServices{query: &stubAnimeQueryService{err: contracts.ErrAnimeNotFound}}
	nothing := animeServices{query: &stubAnimeQueryService{}}
	cases := []struct {
		name     string
		services animeServices
		call     func(*App) (any, error)
		wantCode apperr.Code
		wantMsg  string
	}{
		{"catalog read error is internal", queryFails, animeReads[0].call, apperr.CodeInternal, "snapshot read failed"},
		{"detail read error is internal", queryFails, animeReads[1].call, apperr.CodeInternal, "snapshot read failed"},
		{"unknown detail is not found", notFound, animeReads[1].call, apperr.CodeNotFound, "anime anime-1 not found"},
		{"absent detail is not found", nothing, animeReads[1].call, apperr.CodeNotFound, "anime anime-1 not found"},
		{"detail view read error is internal", queryFails, animeReads[2].call, apperr.CodeInternal, "snapshot read failed"},
		{"unknown detail view is not found", notFound, animeReads[2].call, apperr.CodeNotFound, "anime anime-1 not found"},
		{"absent detail view is not found", nothing, animeReads[2].call, apperr.CodeNotFound, "anime anime-1 not found"},
		{"history page store error is internal", queryFails, animeReads[3].call, apperr.CodeInternal, "snapshot read failed"},
		{"unrecognized order is an invalid argument", animeServices{watchHistory: &stubWatchHistoryQuery{}}, func(a *App) (any, error) {
			return a.GetWatchHistoryPage(contracts.WatchHistoryPageRequest{Order: "sideways"})
		}, apperr.CodeInvalidArgument, `unrecognized watch history order "sideways"`},
		{"anime history page store error is internal", queryFails, animeReads[4].call, apperr.CodeInternal, "snapshot read failed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			value, err := tc.call(readyAnimeApp(tc.services))

			assertAnimeFailure(t, value, err, tc.wantCode, tc.wantMsg)
		})
	}
}

// TestRunAnimeAgainIntentReportsOnlyAMissingAnimeAsATargetMissing pins the "run again" action's
// refusals: only an unknown anime is a deleted target; a starting module or a failed read is
// returned as is. The App has no download service, so reaching RunAnime would panic.
func TestRunAnimeAgainIntentReportsOnlyAMissingAnimeAsATargetMissing(t *testing.T) {
	t.Parallel()
	notFound := animeServices{query: &stubAnimeQueryService{err: contracts.ErrAnimeNotFound}}
	cases := []struct {
		name     string
		app      *App
		wantCode apperr.Code
	}{
		{"an unknown anime is a missing target", readyAnimeApp(notFound), ""},
		{"a starting module stays unavailable", animeApp(notFound, lifecycle.StateStarting), apperr.CodeUnavailable},
		{"a failed read stays internal", readyAnimeApp(animeServices{query: &stubAnimeQueryService{err: errors.New("read failed")}}), apperr.CodeInternal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := tc.app.runAnimeAgainIntent(context.Background(), map[string]string{center.ArgKeyAnimeID: "anime-1"})

			code, _ := apperr.CodeOf(err)
			if errors.Is(err, center.ErrTargetMissing) != (tc.wantCode == "") || code != tc.wantCode {
				t.Fatalf("err = %v (code %q), want code %q and a missing target only for an unknown anime", err, code, tc.wantCode)
			}
		})
	}
}

// TestGetAnimesAnswersTheCatalog proves a ready catalog read passes the rows through, and answers
// an empty, non-nil list for an empty catalog.
func TestGetAnimesAnswersTheCatalog(t *testing.T) {
	t.Parallel()
	rows := []contracts.AnimeListItem{{ID: "anime-1", Name: "Frieren"}}
	for name, items := range map[string][]contracts.AnimeListItem{"rows": rows, "empty": nil} {
		got, err := readyAnimeApp(animeServices{query: &stubAnimeQueryService{items: items}}).GetAnimes()
		if err != nil || got == nil || len(got) != len(items) {
			t.Fatalf("%s: got %#v (err %v), want %d rows in a non-nil list", name, got, err, len(items))
		}
	}
}

func TestGetAnimeDetailReturnsPopulatedDTOForExistingID(t *testing.T) {
	t.Parallel()

	want := &contracts.MobileAnime{ID: "anime-1", Name: "Frieren"}
	app := readyAnimeApp(animeServices{query: &stubAnimeQueryService{mobileAnime: want}})

	got, err := app.GetAnimeDetail("anime-1")
	if err != nil || got == nil {
		t.Fatalf("expected populated detail DTO, got %#v (err %v)", got, err)
	}
	if got.ID != "anime-1" || got.Name != "Frieren" {
		t.Fatalf("unexpected detail DTO: %#v", got)
	}
}

// TestGetWatchHistoryPagePassesThroughStorePage covers the successful passthrough of Store.Page's
// items and cursor.
func TestGetWatchHistoryPagePassesThroughStorePage(t *testing.T) {
	t.Parallel()

	successPage := watchhistory.Page{
		Items: []watchhistory.Entry{
			{ID: 1, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 12, Cycle: 1, WatchedAtMS: 1700000000000, Source: "desktop"},
		},
		NextCursor: "1700000000000:1",
	}
	want := contracts.WatchHistoryPage{
		Items: []contracts.WatchHistoryEntry{
			{ID: 1, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 12, Cycle: 1, WatchedAtMS: 1700000000000, Source: "desktop"},
		},
		NextCursor: "1700000000000:1",
		Status:     "ok",
	}

	app := readyAnimeApp(animeServices{watchHistory: &stubWatchHistoryQuery{page: successPage}})
	got, err := app.GetWatchHistoryPage(contracts.WatchHistoryPageRequest{Cursor: "some-cursor"})
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %#v, got %#v (err %v)", want, got, err)
	}
}

// TestGetWatchHistoryPageForwardsRequestToStore asserts the request maps and
// reaches Store.Page as the PageQuery it expects -- the cursor unchanged and
// the wire Order resolved to its watchhistory.Order constant -- which the
// table above cannot assert because its rows share one call site.
func TestGetWatchHistoryPageForwardsRequestToStore(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		order     string
		wantOrder watchhistory.Order
	}{
		{name: "an empty order forwards as newest-first", order: "", wantOrder: watchhistory.OrderNewestFirst},
		{name: "oldest forwards as oldest-first", order: "oldest", wantOrder: watchhistory.OrderOldestFirst},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			stub := &stubWatchHistoryQuery{}
			app := readyAnimeApp(animeServices{watchHistory: stub})

			if _, err := app.GetWatchHistoryPage(contracts.WatchHistoryPageRequest{Cursor: "1700000000000:5", Order: tc.order}); err != nil {
				t.Fatalf("unexpected error %v", err)
			}

			if stub.lastQuery.Cursor != "1700000000000:5" {
				t.Fatalf("expected cursor %q forwarded to Store.Page, got %q", "1700000000000:5", stub.lastQuery.Cursor)
			}
			if stub.lastQuery.Order != tc.wantOrder {
				t.Fatalf("expected order %v forwarded to Store.Page, got %v", tc.wantOrder, stub.lastQuery.Order)
			}
		})
	}
}

// TestGetAnimeWatchHistoryPagePassesThroughAnimePage covers the successful passthrough, mirroring
// TestGetWatchHistoryPagePassesThroughStorePage.
func TestGetAnimeWatchHistoryPagePassesThroughAnimePage(t *testing.T) {
	t.Parallel()

	successPage := watchhistory.Page{
		Items: []watchhistory.Entry{
			{ID: 2, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 13, Cycle: 1, WatchedAtMS: 1700000001000, Source: "mobile"},
		},
	}
	want := contracts.WatchHistoryPage{
		Items: []contracts.WatchHistoryEntry{
			{ID: 2, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 13, Cycle: 1, WatchedAtMS: 1700000001000, Source: "mobile"},
		},
		Status: "ok",
	}

	app := readyAnimeApp(animeServices{watchHistory: &stubWatchHistoryQuery{page: successPage}})
	request := contracts.AnimeWatchHistoryPageRequest{AnimeID: "anime-1", Cursor: "some-cursor"}
	got, err := app.GetAnimeWatchHistoryPage(request)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %#v, got %#v (err %v)", want, got, err)
	}
}

// TestGetAnimeWatchHistoryPageForwardsRequestToStore asserts every request
// field -- the anime ID, the cursor, and the cycle scope -- reaches
// Store.AnimePage mapped into the PageQuery it expects.
func TestGetAnimeWatchHistoryPageForwardsRequestToStore(t *testing.T) {
	t.Parallel()

	stub := &stubWatchHistoryQuery{}
	app := readyAnimeApp(animeServices{watchHistory: stub})

	if _, err := app.GetAnimeWatchHistoryPage(contracts.AnimeWatchHistoryPageRequest{
		AnimeID: "anime-7", Cycle: 2, Cursor: "1700000000000:5", Limit: 3,
	}); err != nil {
		t.Fatalf("unexpected error %v", err)
	}

	if stub.lastAnimeID != "anime-7" || stub.lastQuery.Cursor != "1700000000000:5" {
		t.Fatalf("expected animeID %q and cursor %q forwarded to Store.AnimePage, got animeID %q cursor %q",
			"anime-7", "1700000000000:5", stub.lastAnimeID, stub.lastQuery.Cursor)
	}
	if stub.lastQuery.Cycle != 2 || stub.lastQuery.Limit != 3 {
		t.Fatalf("expected cycle 2 and limit 3 forwarded to Store.AnimePage, got cycle %d limit %d",
			stub.lastQuery.Cycle, stub.lastQuery.Limit)
	}
}

func TestGetAnimeDetailViewDelegatesToAnimeQuery(t *testing.T) {
	t.Parallel()

	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"totalEpisodes":12,"active":true}`, 777)
	app := readyAnimeApp(animeServices{query: anime.NewQueryService(store)})

	got, err := app.GetAnimeDetailView("anime-1")
	if err != nil {
		t.Fatalf("unexpected error %v", err)
	}

	if got.ID != "anime-1" || got.Name != "Frieren" {
		t.Fatalf("expected anime detail from query service, got %#v", got)
	}
	if got.Progress.Total == nil || *got.Progress.Total != 12 {
		t.Fatalf("expected total 12, got %#v", got.Progress)
	}
	if got.Progress.Remaining == nil || *got.Progress.Remaining != 10 {
		t.Fatalf("expected remaining 10, got %#v", got.Progress)
	}
	if got.ModifiedAt != 777 {
		t.Fatalf("expected modified_at 777, got %d", got.ModifiedAt)
	}
}
