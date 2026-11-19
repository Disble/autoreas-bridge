package desktop

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// seasonReady binds app's season services through the production bind step and marks the
// season module ready, as startup does. Call it again after replacing a service the season
// bindings read (the anime query or the settings store): Bind stores the services it is given.
func seasonReady(app *App) *App {
	app.bindSeasonModule()
	return inModuleState(app, moduleSeason, lifecycle.StateReady)
}

// bindingResult reads binding answers in tests, failing the test on a binding error.
type bindingResult struct {
	t testing.TB
}

// must returns the bindingResult of t.
func must(t testing.TB) bindingResult {
	return bindingResult{t: t}
}

// value returns a binding's value, failing the test when the binding answered an error.
func (r bindingResult) value[T any](value T, err error) T {
	r.t.Helper()
	if err != nil {
		r.t.Fatalf("binding answered an error: %v", err)
	}
	return value
}

// seasonModuleApp returns an App whose season handle is bound through the production bind
// step, moved to state, over an open season holding one created row (row-a, linked to
// anime-a) and one pending row (row-b). The availability scheduler and the anime query are
// stubs; the repository is returned so a test can make its reads fail.
func seasonModuleApp(t *testing.T, state lifecycle.State) (*App, *fakeSeasonRepo) {
	t.Helper()
	ctx := context.Background()
	repo := newFakeSeasonRepo()
	nextID := 0
	service := season.NewService(repo, func() time.Time { return time.UnixMilli(1_700_000_000_000) }, func() string {
		nextID++
		return fmt.Sprintf("id-%d", nextID)
	}, fakeAppNameSearcher{})
	active, err := service.CreateSeason(ctx, "Julio 2026")
	if err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	created := domain.NewSeasonAnime("row-a", active.ID, "Anime A", time.UnixMilli(0))
	created.Availability = domain.AvailabilityCreated
	created.AnimeID = "anime-a"
	pending := domain.NewSeasonAnime("row-b", active.ID, "Anime B", time.UnixMilli(0))
	for _, row := range []domain.SeasonAnime{created, pending} {
		if err := repo.CreateSeasonAnime(ctx, row); err != nil {
			t.Fatalf("seed row: %v", err)
		}
	}
	app := &App{ctx: ctx, seasonService: service, animeQuery: &stubAnimeQueryService{}, seasonScheduler: &fakeAppScheduler{}}
	app.bindSeasonModule()
	return inModuleState(app, moduleSeason, state), repo
}

// openSeasonID returns the open season's id, read from the service itself.
func openSeasonID(a *App) string {
	active, _ := a.seasonService.ActiveSeason(context.Background())
	if active == nil {
		return ""
	}
	return active.ID
}

// servedUnlessDeps maps a command's error to a module answer: the season service's own
// "dependencies not wired" refusal proves a ready module ran it, and anything else is the
// binding's answer as it came.
func servedUnlessDeps(err, deps error) (bool, error) {
	if errors.Is(err, deps) {
		return true, nil
	}
	return err == nil, err
}

// seasonBindings are every season binding: the call reports whether the answer is the one a
// ready module serves over the seasonModuleApp fixture.
var seasonBindings = []struct {
	name string
	call func(*App) (bool, error)
}{
	{"GetSeason", func(a *App) (bool, error) {
		got, err := a.GetSeason()
		return got != nil && got.Name == "Julio 2026", err
	}},
	{"CreateSeason", func(a *App) (bool, error) {
		if err := a.CloseSeason(); err != nil {
			return false, err
		}
		err := a.CreateSeason("Octubre 2026")
		return err == nil, err
	}},
	{"SetSeasonMinApprovalGrade", func(a *App) (bool, error) {
		err := a.SetSeasonMinApprovalGrade(5)
		return err == nil, err
	}},
	{"SetSeasonSlots", func(a *App) (bool, error) {
		err := a.SetSeasonSlots(10)
		return err == nil, err
	}},
	{"CloseSeason", func(a *App) (bool, error) {
		err := a.CloseSeason()
		return err == nil, err
	}},
	{"GetSeasonAnimes", func(a *App) (bool, error) {
		got, err := a.GetSeasonAnimes()
		return len(got) == 2, err
	}},
	{"ImportSeasonIntake", func(a *App) (bool, error) {
		err := a.ImportSeasonIntake("Anime C")
		return err == nil, err
	}},
	{"ReconcileSeasonIntake", func(a *App) (bool, error) {
		err := a.ReconcileSeasonIntake("Anime B")
		return err == nil, err
	}},
	{"RunSeasonMatching", func(a *App) (bool, error) {
		err := a.RunSeasonMatching()
		return err == nil, err
	}},
	{"ResolveSeasonMatch", func(a *App) (bool, error) {
		err := a.ResolveSeasonMatch("row-b", "https://jkanime.net/anime-b/")
		return err == nil, err
	}},
	{"DiscardSeasonName", func(a *App) (bool, error) {
		err := a.DiscardSeasonName("row-b")
		return err == nil, err
	}},
	{"RestoreSeasonName", func(a *App) (bool, error) {
		if err := a.DiscardSeasonName("row-b"); err != nil {
			return false, err
		}
		err := a.RestoreSeasonName("row-b")
		return err == nil, err
	}},
	{"SetSeasonGrade", func(a *App) (bool, error) {
		err := a.SetSeasonGrade("anime-a", 5)
		return err == nil, err
	}},
	{"SkipSeasonGrading", func(a *App) (bool, error) {
		err := a.SkipSeasonGrading("row-a")
		return err == nil, err
	}},
	{"SaveSeasonOrderingDraft", func(a *App) (bool, error) {
		err := a.SaveSeasonOrderingDraft("{}")
		return err == nil, err
	}},
	{"ApplySeasonSchedule", func(a *App) (bool, error) {
		_, err := a.ApplySeasonSchedule()
		return servedUnlessDeps(err, season.ErrAvailabilityDepsUnavailable)
	}},
	{"ReopenSeasonOrdering", func(a *App) (bool, error) {
		err := a.ReopenSeasonOrdering()
		return err == nil, err
	}},
	{"CreateSeasonAnimes", func(a *App) (bool, error) {
		return servedUnlessDeps(a.CreateSeasonAnimes([]string{"row-b"}, nil, nil), season.ErrAvailabilityDepsUnavailable)
	}},
	{"SetSeasonConsideration", func(a *App) (bool, error) {
		err := a.SetSeasonConsideration("row-b", string(domain.ConsiderationNone))
		return err == nil, err
	}},
	{"SetSeasonAnimeMetadata", func(a *App) (bool, error) {
		err := a.SetSeasonAnimeMetadata("row-b", "")
		return err == nil, err
	}},
	{"ConfirmSeasonSelection", func(a *App) (bool, error) {
		_, err := a.ConfirmSeasonSelection()
		return servedUnlessDeps(err, season.ErrSelectionDepsUnavailable)
	}},
	{"ListSeasons", func(a *App) (bool, error) {
		got, err := a.ListSeasons()
		return len(got) == 1, err
	}},
	{"GetPastSeason", func(a *App) (bool, error) {
		got, err := a.GetPastSeason(openSeasonID(a))
		return got != nil && got.Name == "Julio 2026", err
	}},
	{"GetPastSeasonAnimes", func(a *App) (bool, error) {
		got, err := a.GetPastSeasonAnimes(openSeasonID(a))
		return len(got) == 2, err
	}},
	{"GetSeasonOrderingSnapshot", func(a *App) (bool, error) {
		got, err := a.GetSeasonOrderingSnapshot(openSeasonID(a))
		return !got.Recorded && got.Rail != nil, err
	}},
	{"GetSeasonOrderingBoard", func(a *App) (bool, error) {
		got, err := a.GetSeasonOrderingBoard()
		return got.Rail != nil && got.Grid != nil, err
	}},
	{"RecheckSeasonAvailability", func(a *App) (bool, error) {
		err := a.RecheckSeasonAvailability()
		return err == nil && a.seasonScheduler.(*fakeAppScheduler).triggerNowCalls == 1, err
	}},
	{"SearchSeasonProviders", func(a *App) (bool, error) {
		got, err := a.SearchSeasonProviders("")
		return got.Status == "ok" && got.Pages != nil, err
	}},
	{"GetSeasonMode", func(a *App) (bool, error) {
		return a.GetSeasonMode()
	}},
}

// TestSeasonBindingsFollowTheirModule pins S1 for season: no season binding answers null, an
// empty list, an empty board, "off" or an error string while its module starts or after it
// failed, and every one serves its value once it is ready.
func TestSeasonBindingsFollowTheirModule(t *testing.T) {
	t.Parallel()
	for _, binding := range seasonBindings {
		app, _ := seasonModuleApp(t, lifecycle.StateStarting)
		assertStartingThenFailed(t, binding.name, app, moduleSeason, "season is starting", binding.call)
		ready, _ := seasonModuleApp(t, lifecycle.StateReady)
		served, err := binding.call(ready)
		assertModuleAnswer(t, binding.name+" ready", served, err, "", "")
	}
}

// TestSeasonReadFailuresAreInternal pins that a failing season read reaches the frontend as an
// internal failure with its cause, where the binding used to answer null, an empty list, an
// empty board or "off".
func TestSeasonReadFailuresAreInternal(t *testing.T) {
	t.Parallel()
	failure := errors.New("disk I/O error")
	cases := []struct {
		name string
		fail func(*fakeSeasonRepo)
		call func(*App) error
	}{
		{"GetSeason", func(r *fakeSeasonRepo) { r.activeErr = failure }, func(a *App) error { _, err := a.GetSeason(); return err }},
		{"GetSeasonMode", func(r *fakeSeasonRepo) { r.activeErr = failure }, func(a *App) error { _, err := a.GetSeasonMode(); return err }},
		{"GetSeasonAnimes active", func(r *fakeSeasonRepo) { r.activeErr = failure }, func(a *App) error { _, err := a.GetSeasonAnimes(); return err }},
		{"GetSeasonAnimes rows", func(r *fakeSeasonRepo) { r.animesErr = failure }, func(a *App) error { _, err := a.GetSeasonAnimes(); return err }},
		{"GetSeasonOrderingBoard", func(r *fakeSeasonRepo) { r.activeErr = failure }, func(a *App) error { _, err := a.GetSeasonOrderingBoard(); return err }},
		{"GetPastSeason", func(r *fakeSeasonRepo) { r.seasonByIDErr = failure }, func(a *App) error { _, err := a.GetPastSeason("id-1"); return err }},
		{"GetPastSeasonAnimes", func(r *fakeSeasonRepo) { r.animesErr = failure }, func(a *App) error { _, err := a.GetPastSeasonAnimes("id-1"); return err }},
		{"GetSeasonOrderingSnapshot", func(r *fakeSeasonRepo) { r.seasonByIDErr = failure }, func(a *App) error { _, err := a.GetSeasonOrderingSnapshot("id-1"); return err }},
		{"ImportSeasonIntake", func(r *fakeSeasonRepo) { r.activeErr = failure }, func(a *App) error { return a.ImportSeasonIntake("Anime C") }},
	}
	for _, tc := range cases {
		app, repo := seasonModuleApp(t, lifecycle.StateReady)
		tc.fail(repo)

		err := tc.call(app)

		if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal || !errors.Is(err, failure) {
			t.Errorf("%s: err = %v (code %q), want internal wrapping %v", tc.name, err, code, failure)
		}
	}
}

// TestSeasonCommandRefusalsAreErrors pins that a refusal the season service decides reaches the
// frontend as the binding's error carrying the service's message, where it used to be the
// string status itself.
func TestSeasonCommandRefusalsAreErrors(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		call func(*App) error
		want error
	}{
		{"a second open season", func(a *App) error { return a.CreateSeason("Octubre 2026") }, season.ErrSeasonAlreadyOpen},
		{"no open season", func(a *App) error {
			if err := a.CloseSeason(); err != nil {
				return err
			}
			return a.ReconcileSeasonIntake("Anime B")
		}, season.ErrNoActiveSeason},
		{"an unknown row", func(a *App) error { return a.DiscardSeasonName("missing") }, season.ErrSeasonAnimeNotFound},
		{"an invalid consideration", func(a *App) error { return a.SetSeasonConsideration("row-b", "bogus") }, season.ErrInvalidConsideration},
		{"no provider searcher", func(a *App) error { _, err := a.SearchSeasonProviders("Anime B"); return err }, season.ErrSearcherUnavailable},
	}
	for _, tc := range cases {
		app, _ := seasonModuleApp(t, lifecycle.StateReady)

		err := tc.call(app)

		if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal || !errors.Is(err, tc.want) || err.Error() != tc.want.Error() {
			t.Errorf("%s: err = %v (code %q), want internal %q", tc.name, err, code, tc.want)
		}
	}
}

// TestRecheckSeasonAvailabilityResolvesTheScheduler pins the recheck's answers: the scheduler
// starts after the season module is ready, so it is read when the recheck runs; none is a
// coded error, a recheck already running is success, and a refused trigger is the error.
func TestRecheckSeasonAvailabilityResolvesTheScheduler(t *testing.T) {
	t.Parallel()
	refused := errors.New("scheduler stopped")
	cases := []struct {
		name      string
		scheduler schedule.Scheduler
		want      error
	}{
		{"no scheduler yet", nil, errSeasonAvailabilityUnavailable},
		{"a recheck already running", &fakeAppScheduler{triggerNowErr: schedule.ErrRunInProgress}, nil},
		{"a refused trigger", &fakeAppScheduler{triggerNowErr: refused}, refused},
	}
	for _, tc := range cases {
		app, _ := seasonModuleApp(t, lifecycle.StateReady)
		// Set after the module is ready, as startSeasonAvailability does.
		app.seasonScheduler = tc.scheduler

		err := app.RecheckSeasonAvailability()

		if !errors.Is(err, tc.want) || (tc.want == nil) != (err == nil) {
			t.Errorf("%s: RecheckSeasonAvailability() = %v, want %v", tc.name, err, tc.want)
		}
		if code, _ := apperr.CodeOf(err); tc.want != nil && code != apperr.CodeInternal {
			t.Errorf("%s: code = %q, want internal", tc.name, code)
		}
	}
}

// TestBindSeasonModuleNeedsTheSeasonService proves the bind step binds nothing without the
// season service, so a module the wiring check would fail can never serve without it.
func TestBindSeasonModuleNeedsTheSeasonService(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{}}

	app.bindSeasonModule()
	_ = app.moduleSet().writer.MarkReady(moduleSeason)

	// An unbound handle is the only way a ready module answers this; a bound one reads.
	if _, err := app.GetSeason(); err == nil || !strings.Contains(err.Error(), "season is ready without services") {
		t.Fatalf("GetSeason = %v; want the unbound-module failure", err)
	}
}

// TestSeasonBindingsReadTheBoundAnimeQuery proves the boards and the intake overlay read the
// anime query bound with the module: without it the ordering board refuses instead of
// answering an empty board.
func TestSeasonBindingsReadTheBoundAnimeQuery(t *testing.T) {
	t.Parallel()
	app, _ := seasonModuleApp(t, lifecycle.StateReady)
	app.animeQuery = nil
	seasonReady(app)

	if _, err := app.GetSeasonOrderingBoard(); !errors.Is(err, errOrderingBoardUnavailable) {
		t.Fatalf("GetSeasonOrderingBoard() = %v, want %v", err, errOrderingBoardUnavailable)
	}
}

// TestSeasonOrderingBoardWithoutOpenSeasonIsEmpty pins that no open season is a state, not a
// failure: the board read answers an empty, non-nil board, while a close refuses.
func TestSeasonOrderingBoardWithoutOpenSeasonIsEmpty(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)

	board, err := app.GetSeasonOrderingBoard()

	if err != nil || board.Rail == nil || len(board.Rail) != 0 || board.Grid == nil || len(board.Grid) != 0 {
		t.Fatalf("GetSeasonOrderingBoard() = %+v, %v; want an empty, non-nil board", board, err)
	}
}

// TestCreateSeasonAnimesReadsTheBoundLibraryRoot pins that the create reads the library root
// from the settings store bound with the season module: the new anime's default folder sits
// under it.
func TestCreateSeasonAnimesReadsTheBoundLibraryRoot(t *testing.T) {
	fixture := newRuntimeSeasonFixture(t)
	fixture.seedAvailableRow(t, "sa-a", "Frieren", "https://jkanime.net/frieren/")
	store := newRenameSettingsStore(t)
	root := filepath.Join(t.TempDir(), "Anime")
	if err := store.SetLibraryRoot(context.Background(), root); err != nil {
		t.Fatalf("SetLibraryRoot: %v", err)
	}
	fixture.app.settingsStore = store
	seasonReady(fixture.app)

	if err := fixture.app.CreateSeasonAnimes([]string{"sa-a"}, nil, nil); err != nil {
		t.Fatalf("CreateSeasonAnimes: %v", err)
	}

	record, _ := readCreatedAnime(t, fixture.store, "created-anime")
	if want := filepath.Join(root, "Frieren"); record.Folder != want {
		t.Fatalf("folder = %q, want %q under the bound library root", record.Folder, want)
	}
}
