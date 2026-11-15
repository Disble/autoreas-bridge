package desktop

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/backfill"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

// A stale frontend still sending "episodes" on the anime save must store no duration, applied or conflict.
func TestSaveAnimeEditorIgnoresAWireEpisodesKey(t *testing.T) {
	for _, tc := range []struct {
		name string
		base int64
		want contracts.AnimePatchOutcome
	}{{"applied", 100, contracts.AnimePatchOutcomeApplied}, {"conflict", 99, contracts.AnimePatchOutcomeConflict}} {
		t.Run(tc.name, func(t *testing.T) {
			app, _ := editorEpisodeApp(t)
			raw := `{"animeId":"anime-1","baseModifiedAt":` + jsonInt(tc.base) + `,"patch":{"name":"X"},"episodes":[{"episode":1,"durationMs":60000,"source":"manual"}]}`
			var cmd SaveAnimeEditorCommandDTO
			if err := json.Unmarshal([]byte(raw), &cmd); err != nil {
				t.Fatal(err)
			}
			if got, err := app.SaveAnimeEditor(cmd); err != nil || got.Outcome != tc.want {
				t.Fatalf("want %s, got %#v (err %v)", tc.want, got, err)
			}
			if rows := storedEpisodes(t, app); len(rows) != 0 {
				t.Fatalf("anime save stored durations: %+v", rows)
			}
		})
	}
}

// One bad edit placed last (after good ones, including a clear) stores none.
func TestSaveEpisodeDurationsBadEditLastStoresNothing(t *testing.T) {
	app, _ := editorEpisodeApp(t)
	ok, err := app.SaveEpisodeDurations("anime-1", []EpisodeDurationEditDTO{{Episode: 2, DurationMs: 60_000, Source: episodes.SourceManual}})
	if err != nil || ok.Outcome != contracts.AnimePatchOutcomeApplied {
		t.Fatalf("seed: %#v (err %v)", ok, err)
	}
	got, err := app.SaveEpisodeDurations("anime-1", []EpisodeDurationEditDTO{
		{Episode: 1, DurationMs: (24 * time.Minute).Milliseconds(), Source: episodes.SourceManual},
		{Episode: 2, Clear: true},
		{Episode: 3, DurationMs: 60_000, Source: "bogus"},
	})
	if err == nil || got.Changed != 0 {
		t.Fatalf("want an error, got %#v (err %v)", got, err)
	}
	if rows := storedEpisodes(t, app); len(rows) != 1 || rows[0].Episode != 2 {
		t.Fatalf("want only the seeded episode 2, got %+v", rows)
	}
}

// Anime edits interleaved with a download run: only the run's anime is triggered.
func TestEpisodeBackfillOnlyDownloadRunsTrigger(t *testing.T) {
	bus, triggers := subscribedTriggers()
	bus.Publish(events.AnimeChangedEvent{AnimeID: "x", ChangeType: events.AnimeChangeTypeCreate, ChangedFields: []string{"folder", "active"}})
	bus.Publish(events.DownloadEpisodeDownloadedEvent{RunID: "r1", AnimeID: "b"})
	bus.Publish(events.AnimeChangedEvent{AnimeID: "b", ChangedFields: []string{"folder"}})
	bus.Publish(events.DownloadRunFinishedEvent{RunID: "r1"})
	if want := []backfill.Scope{backfill.Only("b")}; !reflect.DeepEqual(triggers.scopes, want) {
		t.Fatalf("want %v, got %v", want, triggers.scopes)
	}
}

// jsonInt renders v as the JSON number a wire payload carries.
func jsonInt(v int64) string { b, _ := json.Marshal(v); return string(b) }
