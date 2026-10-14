package desktop

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/durationedit"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

// editorEpisodeApp is an App over a real bridge database holding anime-1 at modified_at 100.
func editorEpisodeApp(t *testing.T) (*App, *bridgeSync.AnimeSnapshotStore) {
	t.Helper()

	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	service := anime.NewEditorService(store, &stubAppUpdateWriter{})
	service.SetDeps(anime.WriteServiceDeps{Conflicts: bridgeSync.NewConflictStore(db)})
	service.SetNow(func() time.Time { return time.UnixMilli(200).UTC() })
	return &App{ctx: context.Background(), bridgeDB: db, animeEditorWrite: service,
		animeEditorQuery: anime.NewQueryService(store)}, store
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

func TestSaveAnimeEditorWithOnlyEpisodesNeverTouchesTheAnime(t *testing.T) {
	app, store := editorEpisodeApp(t)

	// A stale base: an episodes-only save must not be blocked by it, nor move modified_at.
	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 99, Episodes: []EpisodeDurationEditDTO{
		{Episode: 3, DurationMs: (46 * time.Minute).Milliseconds(), Source: episodes.SourceManual},
	}})

	if got.Outcome != contracts.AnimePatchOutcomeApplied || got.Record == nil || got.Record.ModifiedAt != 100 {
		t.Fatalf("want applied with the untouched record, got %#v", got)
	}
	if rows := storedEpisodes(t, app); len(rows) != 1 || rows[0].Episode != 3 || rows[0].Source != episodes.SourceManual {
		t.Fatalf("want episode 3 stored by hand, got %+v", rows)
	}
	if record, err := store.GetSnapshot(context.Background(), "anime-1"); err != nil || record.ModifiedAt != 100 {
		t.Fatalf("the anime must be untouched, got %+v (%v)", record, err)
	}

	again := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100, Episodes: []EpisodeDurationEditDTO{
		{Episode: 3, DurationMs: (46 * time.Minute).Milliseconds(), Source: episodes.SourceManual},
	}})
	if again.Outcome != contracts.AnimePatchOutcomeNoOp {
		t.Fatalf("an identical episodes-only save is a no-op, got %#v", again)
	}
}

func TestSaveAnimeEditorSavesThePatchAndTheEpisodesTogether(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	name := "Frieren X"

	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100,
		Patch:    AnimeEditorPatchDTO{Name: &name},
		Episodes: []EpisodeDurationEditDTO{{Episode: 1, DurationMs: 60_000, Source: episodes.SourceMeasured}},
	})

	if got.Outcome != contracts.AnimePatchOutcomeApplied || got.ModifiedAt != 200 {
		t.Fatalf("want the patch applied, got %#v", got)
	}
	if rows := storedEpisodes(t, app); len(rows) != 1 || rows[0].Source != episodes.SourceMeasured {
		t.Fatalf("want the confirmed reading stored, got %+v", rows)
	}
}

func TestSaveAnimeEditorPatchNoOpWithChangedEpisodesIsApplied(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	same := "Frieren"

	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100,
		Patch:    AnimeEditorPatchDTO{Name: &same},
		Episodes: []EpisodeDurationEditDTO{{Episode: 1, DurationMs: 60_000, Source: episodes.SourceManual}},
	})

	if got.Outcome != contracts.AnimePatchOutcomeApplied {
		t.Fatalf("a no-op patch with a changed episode is applied, got %#v", got)
	}
}

func TestSaveAnimeEditorRefusesABadEpisodeEditAndSavesNothing(t *testing.T) {
	app, store := editorEpisodeApp(t)
	name := "Frieren X"

	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100,
		Patch:    AnimeEditorPatchDTO{Name: &name},
		Episodes: []EpisodeDurationEditDTO{{Episode: 0, DurationMs: 60_000, Source: episodes.SourceManual}},
	})

	if got.Outcome != contracts.AnimePatchOutcomeError {
		t.Fatalf("a bad episode edit must fail the save, got %#v", got)
	}
	if rows := storedEpisodes(t, app); len(rows) != 0 {
		t.Fatalf("nothing may be stored, got %+v", rows)
	}
	if record, err := store.GetSnapshot(context.Background(), "anime-1"); err != nil || record.ModifiedAt != 100 {
		t.Fatalf("the anime must be untouched, got %+v (%v)", record, err)
	}
}

func TestSaveAnimeEditorWithoutEpisodesKeepsItsConflict(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	name := "Stale"

	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 99, Patch: AnimeEditorPatchDTO{Name: &name}})

	if got.Outcome != contracts.AnimePatchOutcomeConflict {
		t.Fatalf("an anime-only stale save still conflicts, got %#v", got)
	}
}

func TestSaveAnimeEditorEpisodesWithoutADatabaseFail(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	app.bridgeDB = nil

	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100,
		Episodes: []EpisodeDurationEditDTO{{Episode: 1, DurationMs: 60_000, Source: episodes.SourceManual}}})

	if got.Outcome != contracts.AnimePatchOutcomeError {
		t.Fatalf("want an error without a database, got %#v", got)
	}
}

func TestGetEpisodeDurationSectionReadsTheDraftsFolder(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	folder := t.TempDir()
	if err := os.WriteFile(filepath.Join(folder, "Show - 02.mkv"), []byte("x"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	tv, total := 0, 2

	got := app.GetEpisodeDurationSection(EpisodeDurationAnimeDTO{AnimeID: "anime-1", Folder: folder, TotalEpisodes: &total, Kind: &tv})

	if got.Outcome != episodeEditorOutcomeOK || got.FolderStatus != durationedit.FolderFound || !got.TV {
		t.Fatalf("want a found folder of a TV anime, got %+v", got)
	}
	want := []EpisodeDurationRowDTO{{Episode: 1, Source: durationedit.SourceNotMeasured}, {Episode: 2, Source: durationedit.SourceNotMeasuredFileFound}}
	if len(got.Rows) != 2 || got.Rows[0] != want[0] || got.Rows[1] != want[1] || got.BeyondTotal == nil {
		t.Fatalf("want rows %+v and an empty beyond list, got %+v", want, got)
	}

	app.bridgeDB = nil
	if got := app.GetEpisodeDurationSection(EpisodeDurationAnimeDTO{AnimeID: "anime-1"}); got.Outcome != episodeEditorOutcomeError {
		t.Fatalf("want an error without a database, got %+v", got)
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

	got := app.ReanalyzeEpisodeDurations(EpisodeDurationAnimeDTO{AnimeID: "anime-1", Folder: folder})

	// The files are not videos: with ffprobe each one is unreadable, without it the analysis stops
	// at the first file. Either way the first file announced its progress and nothing was stored.
	if got.Outcome != episodeEditorOutcomeOK || got.FilesRecognized != 2 || got.Rows == nil {
		t.Fatalf("want a review of the 2 files, got %+v", got)
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
	busy := app.ReanalyzeEpisodeDurations(EpisodeDurationAnimeDTO{AnimeID: "anime-1"})
	app.episodeDurations.reanalysis.running.Unlock()
	if busy.Outcome != episodeEditorOutcomeBusy {
		t.Fatalf("a second re-analysis must be refused, got %+v", busy)
	}

	cancelled := false
	app.episodeDurations.reanalysis.cancel = func() { cancelled = true }
	app.CancelEpisodeReanalysis()
	if !cancelled {
		t.Fatal("Cancel must end the running re-analysis")
	}
	app.episodeDurations.reanalysis.cancel = nil
	app.CancelEpisodeReanalysis()

	noFolder := app.ReanalyzeEpisodeDurations(EpisodeDurationAnimeDTO{AnimeID: "anime-1"})
	if noFolder.Outcome != episodeEditorOutcomeOK || noFolder.Status != durationedit.StatusNoFolder || noFolder.Rows == nil {
		t.Fatalf("want no folder, got %+v", noFolder)
	}
	if app.episodeDurations.reanalysis.cancel != nil {
		t.Error("a finished re-analysis must drop its cancel")
	}

	app.bridgeDB = nil
	if got := app.ReanalyzeEpisodeDurations(EpisodeDurationAnimeDTO{AnimeID: "anime-1"}); got.Outcome != episodeEditorOutcomeError {
		t.Fatalf("want an error without a database, got %+v", got)
	}
}
