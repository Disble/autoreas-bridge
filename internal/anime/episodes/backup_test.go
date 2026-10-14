package episodes_test

import (
	"bytes"
	"context"
	"reflect"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
)

// TestBackupRoundTripReplacesEveryDurationAndMarksEveryAffectedAnime exports
// one database and imports the bundle into another: the target's durations
// become exactly the source's (value, source and updated_at_ms), its own
// rows are gone (full refresh), and every anime with durations before or
// after the import is marked pending announce with a renewed mark, so Mobile
// hears about restored and dropped durations alike (L12).
func TestBackupRoundTripReplacesEveryDurationAndMarksEveryAffectedAnime(t *testing.T) {
	ctx := context.Background()
	clock := &testClock{ms: 1}
	sourceDB := openTestDB(t)
	source := episodes.NewStore(sourceDB, clock.now)
	must(t, source.SetManual(ctx, "a", 1, 1000))
	clock.ms = 2
	_, err := source.FillGaps(ctx, "a", []episodes.Reading{{Episode: 2, DurationMS: 2000}})
	must(t, err)
	_, err = source.FillGaps(ctx, "b", []episodes.Reading{{Episode: 1, DurationMS: 3000}})
	must(t, err)

	var bundle bytes.Buffer
	exported, err := episodes.ExportEpisodeDurations(sourceDB)(ctx, &bundle)
	if err != nil || exported != 3 {
		t.Fatalf("export = (%d, %v), want (3, nil)", exported, err)
	}

	targetDB := openTestDB(t)
	target := episodes.NewStore(targetDB, clock.now)
	must(t, target.SetManual(ctx, "stale", 1, 9000))
	marks, err := target.PendingAnnounce(ctx)
	must(t, err)

	imported, err := episodes.ImportEpisodeDurations(targetDB, clock.now)(ctx, bytes.NewReader(bundle.Bytes()))
	if err != nil || imported != 3 {
		t.Fatalf("import = (%d, %v), want (3, nil)", imported, err)
	}
	got, err := target.ByAnimeIDs(ctx, []string{"a", "b", "stale"})
	must(t, err)
	want := map[string][]episodes.Duration{
		"a": {row("a", 1, 1000, episodes.SourceManual, 1), row("a", 2, 2000, episodes.SourceMeasured, 2)},
		"b": {row("b", 1, 3000, episodes.SourceMeasured, 2)},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("imported durations = %+v, want %+v", got, want)
	}
	if len(marks) != 1 || marks[0].AnimeID != "stale" {
		t.Fatalf("pending before import = %+v, want only stale", marks)
	}
	after, err := target.PendingAnnounce(ctx)
	must(t, err)
	byAnime := map[string]int64{}
	for _, p := range after {
		byAnime[p.AnimeID] = p.MarkedAtMS
	}
	if len(after) != 3 || byAnime["a"] == 0 || byAnime["b"] == 0 {
		t.Fatalf("pending after import = %+v, want a, b and stale", after)
	}
	if byAnime["stale"] <= marks[0].MarkedAtMS {
		t.Fatalf("the dropped anime's mark must be renewed past %d, got %d", marks[0].MarkedAtMS, byAnime["stale"])
	}
}

// TestImportOfAnEmptyBundleMarksEveryDroppedAnime proves the mark taken before
// the delete: a bundle with no durations still tells Mobile that the ones it
// had are gone.
func TestImportOfAnEmptyBundleMarksEveryDroppedAnime(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	clock := &testClock{ms: 1}
	s := episodes.NewStore(db, clock.now)
	_, err := s.FillGaps(ctx, "gone", []episodes.Reading{{Episode: 1, DurationMS: 1000}})
	must(t, err)
	before, err := s.PendingAnnounce(ctx)
	must(t, err)
	must(t, s.ClearPending(ctx, before[0]))

	clock.ms = 7
	if _, err := episodes.ImportEpisodeDurations(db, clock.now)(ctx, strings.NewReader("")); err != nil {
		t.Fatalf("import an empty bundle: %v", err)
	}

	assertRows(t, s, "gone", nil)
	after, err := s.PendingAnnounce(ctx)
	must(t, err)
	if len(after) != 1 || after[0] != (episodes.Pending{AnimeID: "gone", MarkedAtMS: 7}) {
		t.Fatalf("pending after an empty import = %+v, want gone marked at 7", after)
	}
}

// TestImportFailureLeavesExistingDurations proves the full refresh is one
// transaction: a bad line after a good one rolls back the delete too.
func TestImportFailureLeavesExistingDurations(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	s := episodes.NewStore(db, (&testClock{ms: 1}).now)
	must(t, s.SetManual(ctx, "a", 1, 1000))

	bundle := `{"anime_id":"b","episode":1,"duration_ms":2000,"source":"measured","updated_at_ms":1}` + "\nnot json\n"
	if _, err := episodes.ImportEpisodeDurations(db, time.Now)(ctx, strings.NewReader(bundle)); err == nil {
		t.Fatal("import accepted a malformed line")
	}
	assertRows(t, s, "a", []episodes.Duration{row("a", 1, 1000, episodes.SourceManual, 1)})
	assertRows(t, s, "b", nil)
}

// TestValidateEpisodeDurationsChecksEveryRecord tables the validator: a
// well-formed stream reports its count, and each broken invariant fails.
func TestValidateEpisodeDurationsChecksEveryRecord(t *testing.T) {
	const valid = `{"anime_id":"a","episode":1,"duration_ms":1000,"source":"manual","updated_at_ms":1}`
	cases := []struct {
		name    string
		line    string
		wantErr bool
	}{
		{name: "valid record", line: valid},
		{name: "malformed line", line: "not json", wantErr: true},
		{name: "empty anime id", line: strings.Replace(valid, `"a"`, `""`, 1), wantErr: true},
		{name: "episode zero", line: strings.Replace(valid, `"episode":1`, `"episode":0`, 1), wantErr: true},
		{name: "zero duration", line: strings.Replace(valid, `"duration_ms":1000`, `"duration_ms":0`, 1), wantErr: true},
		{name: "one millisecond duration", line: strings.Replace(valid, `"duration_ms":1000`, `"duration_ms":1`, 1)},
		{name: "measured source", line: strings.Replace(valid, `"manual"`, `"measured"`, 1)},
		{name: "empty source", line: strings.Replace(valid, `"manual"`, `""`, 1), wantErr: true},
		{name: "other source", line: strings.Replace(valid, `"manual"`, `"other"`, 1), wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			count, err := episodes.ValidateEpisodeDurations()(context.Background(), strings.NewReader(valid+"\n"+tc.line+"\n"))
			if tc.wantErr != (err != nil) {
				t.Fatalf("validate error = %v, want error %v", err, tc.wantErr)
			}
			if !tc.wantErr && count != 2 {
				t.Fatalf("validate count = %d, want 2", count)
			}
		})
	}
}
