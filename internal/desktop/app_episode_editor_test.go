package desktop

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/durationedit"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
	bridgeSync "autoreas-bridge/internal/sync"
)

// editorEpisodeApp is an App over a real bridge database holding anime-1 at modified_at 100.
func editorEpisodeApp(t *testing.T) (*App, *bridgeSync.AnimeSnapshotStore) {
	t.Helper()

	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	service := anime.NewEditorService(store, &stubAppCommittedPublisher{})
	service.SetDeps(anime.WriteServiceDeps{Conflicts: bridgeSync.NewConflictStore(db)})
	service.SetNow(func() time.Time { return time.UnixMilli(200).UTC() })
	app := &App{ctx: context.Background(), bridgeDB: db}
	app.moduleSet().anime.Bind(animeServices{editorWrite: service, editorQuery: anime.NewQueryService(store)})
	app.moduleSet().episodes.Bind(episodeServices{durations: db})
	for _, module := range []lifecycle.ModuleID{moduleAnime, moduleEpisodes} {
		if err := app.moduleSet().writer.MarkReady(module); err != nil {
			t.Fatalf("mark %s ready: %v", module, err)
		}
	}
	return app, store
}

// durationEditorApp returns an App whose episodes handle serves the bridge database db in the given state.
func durationEditorApp(db *sql.DB, state lifecycle.State) *App {
	app := &App{ctx: context.Background(), bridgeDB: db}
	app.moduleSet().episodes.Bind(episodeServices{durations: db})
	switch state {
	case lifecycle.StateReady:
		_ = app.moduleSet().writer.MarkReady(moduleEpisodes)
	case lifecycle.StateFailed:
		_ = app.moduleSet().writer.MarkFailed(moduleEpisodes, "episodes: episode service was not wired")
	}
	return app
}

// episodeDurationBindings calls each durations-editor binding and returns its error; needsDB says
// whether the binding reads the bridge database.
var episodeDurationBindings = []struct {
	name    string
	needsDB bool
	call    func(*App) error
}{
	{"GetEpisodeDurationSection", true, func(a *App) error {
		_, err := a.GetEpisodeDurationSection(EpisodeDurationAnimeDTO{AnimeID: "anime-1"})
		return err
	}},
	{"ReanalyzeEpisodeDurations", true, func(a *App) error {
		_, err := a.ReanalyzeEpisodeDurations(EpisodeDurationAnimeDTO{AnimeID: "anime-1"})
		return err
	}},
	{"CancelEpisodeReanalysis", false, func(a *App) error { return a.CancelEpisodeReanalysis() }},
	{"SaveEpisodeDurations", true, func(a *App) error {
		_, err := a.SaveEpisodeDurations("anime-1", []EpisodeDurationEditDTO{{Episode: 1, DurationMs: 60_000, Source: episodes.SourceManual}})
		return err
	}},
}

// TestEpisodeDurationBindingsFollowTheEpisodesModule: no durations-editor binding answers a
// stand-in outcome while the episodes module starts, after it failed, or without a database.
func TestEpisodeDurationBindingsFollowTheEpisodesModule(t *testing.T) {
	for _, binding := range episodeDurationBindings {
		t.Run(binding.name+"/starting then failed", func(t *testing.T) {
			app := durationEditorApp(openRuntimeBridgeDB(t), lifecycle.StateStarting)
			assertCodedFailure(t, binding.call(app), apperr.CodeUnavailable, "episodes is starting")

			_ = app.moduleSet().writer.MarkFailed(moduleEpisodes, "episodes: episode service was not wired")
			assertCodedFailure(t, binding.call(app), apperr.CodeFailedPrecondition, "episodes: episode service was not wired")
		})
		t.Run(binding.name+"/ready without a database is internal", func(t *testing.T) {
			wantCode, wantMsg := apperr.CodeInternal, "episode durations unavailable"
			if !binding.needsDB {
				wantCode, wantMsg = "", "" // it never reads the database, so it cannot miss one
			}
			assertCodedFailure(t, binding.call(durationEditorApp(nil, lifecycle.StateReady)), wantCode, wantMsg)
		})
	}
}

// assertCodedFailure checks that err carries wantCode and wantMsg, or that it is nil when wantCode is empty.
func assertCodedFailure(t *testing.T, err error, wantCode apperr.Code, wantMsg string) {
	t.Helper()
	code, _ := apperr.CodeOf(err)
	if wantCode == "" && err == nil {
		return
	}
	if err == nil || code != wantCode || err.Error() != wantMsg {
		t.Fatalf("got code %q (err %v), want %q %q", code, err, wantCode, wantMsg)
	}
}

// storedEpisodes reads anime-1's stored durations.
func storedEpisodes(t *testing.T, app *App) []episodes.Duration {
	t.Helper()

	got, err := episodes.NewStore(app.bridgeDB, time.Now).ByAnime(context.Background(), "anime-1")
	if err != nil {
		t.Fatalf("read durations: %v", err)
	}
	return got
}

func TestSaveEpisodeDurationsStoresTheEditsAndNeverTouchesTheAnime(t *testing.T) {
	app, store := editorEpisodeApp(t)
	edit := EpisodeDurationEditDTO{Episode: 3, DurationMs: (46 * time.Minute).Milliseconds(), Source: episodes.SourceManual}

	got, err := app.SaveEpisodeDurations("anime-1", []EpisodeDurationEditDTO{edit})

	if err != nil || got.Outcome != contracts.AnimePatchOutcomeApplied || got.Changed != 1 {
		t.Fatalf("want applied with one changed row, got %#v (err %v)", got, err)
	}
	if rows := storedEpisodes(t, app); len(rows) != 1 || rows[0].Episode != 3 || rows[0].Source != episodes.SourceManual {
		t.Fatalf("want episode 3 stored by hand, got %+v", rows)
	}
	if record, err := store.GetSnapshot(context.Background(), "anime-1"); err != nil || record.ModifiedAt != 100 {
		t.Fatalf("the anime must be untouched, got %+v (%v)", record, err)
	}

	if again, err := app.SaveEpisodeDurations("anime-1", []EpisodeDurationEditDTO{edit}); err != nil || again.Outcome != contracts.AnimePatchOutcomeNoOp || again.Changed != 0 {
		t.Fatalf("an identical save is a no-op, got %#v (err %v)", again, err)
	}
}

func TestSaveEpisodeDurationsWithNoEditsIsANoOp(t *testing.T) {
	app, _ := editorEpisodeApp(t)

	if got, err := app.SaveEpisodeDurations("anime-1", nil); err != nil || got.Outcome != contracts.AnimePatchOutcomeNoOp {
		t.Fatalf("want a no-op, got %#v (err %v)", got, err)
	}
}

func TestSaveEpisodeDurationsRefusesABadEditAndSavesNothing(t *testing.T) {
	app, _ := editorEpisodeApp(t)

	got, err := app.SaveEpisodeDurations("anime-1", []EpisodeDurationEditDTO{
		{Episode: 1, DurationMs: 60_000, Source: episodes.SourceManual},
		{Episode: 0, DurationMs: 60_000, Source: episodes.SourceManual},
	})

	if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal || got != (EpisodeDurationSaveResult{}) {
		t.Fatalf("a bad edit must fail the save with a coded error and no result, got %#v (err %v)", got, err)
	}
	if rows := storedEpisodes(t, app); len(rows) != 0 {
		t.Fatalf("nothing may be stored, got %+v", rows)
	}
}

func TestSaveAnimeEditorStaleBaseConflictsAndStoresNoDuration(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	name := "Stale"

	got, err := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 99, Patch: AnimeEditorPatchDTO{Name: &name}})

	// The conflict hands back the current token (the seed's 100) and the recorded conflict.
	if err != nil || got.Outcome != contracts.AnimePatchOutcomeConflict || got.ModifiedAt != 100 || got.ConflictID == "" {
		t.Fatalf("a stale save conflicts with the current token and a conflict id, got %#v", got)
	}
	if rows := storedEpisodes(t, app); len(rows) != 0 {
		t.Fatalf("an anime save never writes durations, got %+v", rows)
	}
}

func TestGetEpisodeDurationSectionReadsTheDraftsFolder(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	folder := t.TempDir()
	if err := os.WriteFile(filepath.Join(folder, "Show - 02.mkv"), []byte("x"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	tv, total := 0, 2

	got, err := app.GetEpisodeDurationSection(EpisodeDurationAnimeDTO{AnimeID: "anime-1", Folder: folder, TotalEpisodes: &total, Kind: &tv})

	if err != nil || got.FolderStatus != durationedit.FolderFound || !got.TV {
		t.Fatalf("want a found folder of a TV anime, got %+v (err %v)", got, err)
	}
	want := []EpisodeDurationRowDTO{{Episode: 1, Source: durationedit.SourceNotMeasured}, {Episode: 2, Source: durationedit.SourceNotMeasuredFileFound}}
	if len(got.Rows) != 2 || got.Rows[0] != want[0] || got.Rows[1] != want[1] || got.BeyondTotal == nil {
		t.Fatalf("want rows %+v and an empty beyond list, got %+v", want, got)
	}
}

func TestReanalyzeEpisodeDurationsEmitsProgressAndWritesNothing(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	folder := t.TempDir()
	for _, name := range []string{"Show - 01.mkv", "Show - 02.mkv"} {
		if err := os.WriteFile(filepath.Join(folder, name), []byte("not a video"), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
	}
	var mu sync.Mutex
	var progress []EpisodeDurationReanalysisProgress
	app.emitFn = func(_ context.Context, name string, data ...any) {
		if name != episodeReanalysisProgressEvent {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		progress = append(progress, data[0].(EpisodeDurationReanalysisProgress))
	}

	got, err := app.ReanalyzeEpisodeDurations(EpisodeDurationAnimeDTO{AnimeID: "anime-1", Folder: folder})

	// The files are not videos: with ffprobe each one is unreadable, without it the analysis stops
	// at the first file. Either way the first file announced its progress and nothing was stored.
	if err != nil || got.Outcome != episodeEditorOutcomeOK || got.FilesRecognized != 2 || got.Rows == nil {
		t.Fatalf("want a review of the 2 files, got %+v (err %v)", got, err)
	}
	if got.Status != durationedit.StatusOK && got.Status != durationedit.StatusProbeUnavailable {
		t.Fatalf("want ok or probe unavailable, got %+v", got)
	}
	if len(progress) == 0 || progress[0] != (EpisodeDurationReanalysisProgress{AnimeID: "anime-1", Index: 1, Total: 2, Episode: 1}) {
		t.Fatalf("want progress for the first file, got %+v", progress)
	}
	if rows := storedEpisodes(t, app); len(rows) != 0 {
		t.Fatalf("a re-analysis must write nothing, got %+v", rows)
	}
}

func TestReanalyzeEpisodeDurationsRunsOneAtATimeAndCancels(t *testing.T) {
	app, _ := editorEpisodeApp(t)

	app.episodeDurations.reanalysis.running.Lock()
	busy, err := app.ReanalyzeEpisodeDurations(EpisodeDurationAnimeDTO{AnimeID: "anime-1"})
	app.episodeDurations.reanalysis.running.Unlock()
	if err != nil || busy.Outcome != episodeEditorOutcomeBusy || busy.Message == "" {
		t.Fatalf("a second re-analysis must be refused as an outcome with its reason, got %+v (err %v)", busy, err)
	}

	cancelled := false
	app.episodeDurations.reanalysis.cancel = func() { cancelled = true }
	if err := app.CancelEpisodeReanalysis(); err != nil || !cancelled {
		t.Fatalf("Cancel must end the running re-analysis, got cancelled %t (err %v)", cancelled, err)
	}
	app.episodeDurations.reanalysis.cancel = nil
	if err := app.CancelEpisodeReanalysis(); err != nil {
		t.Fatalf("Cancel with nothing running must succeed, got %v", err)
	}

	noFolder, err := app.ReanalyzeEpisodeDurations(EpisodeDurationAnimeDTO{AnimeID: "anime-1"})
	if err != nil || noFolder.Outcome != episodeEditorOutcomeOK || noFolder.Status != durationedit.StatusNoFolder || noFolder.Rows == nil {
		t.Fatalf("want no folder, got %+v (err %v)", noFolder, err)
	}
	if app.episodeDurations.reanalysis.cancel != nil {
		t.Error("a finished re-analysis must drop its cancel")
	}
}
