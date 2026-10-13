package anime

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/lengths"
	"autoreas-bridge/internal/api/contracts"
)

// storedDurations answers the one Today read from a fixed map and records every read it served.
type storedDurations struct {
	byAnime map[string][]episodes.Duration
	asked   [][]string
}

func (s *storedDurations) ByAnimeIDs(_ context.Context, animeIDs []string) (map[string][]episodes.Duration, error) {
	s.asked = append(s.asked, animeIDs)
	return s.byAnime, nil
}

// durationOf is one stored episode duration.
func durationOf(animeID string, episode int, runtime time.Duration) episodes.Duration {
	return episodes.Duration{AnimeID: animeID, Episode: episode, DurationMS: runtime.Milliseconds(),
		Source: episodes.SourceMeasured}
}

// scheduleQuery answers the one read a schedule needs. The embedded interface leaves every other method
// to panic if the read path ever reaches one, which is what a test wants.
type scheduleQuery struct {
	EpisodeQuery
	animes []contracts.MobileAnime
}

func (q scheduleQuery) ListMobileAnimes(context.Context) ([]contracts.MobileAnime, error) {
	return q.animes, nil
}

// dayAnime is one active anime of Monday pointing at folder.
func dayAnime(id, folder string, progress float64, kind *int) contracts.MobileAnime {
	return contracts.MobileAnime{
		ID:              id,
		Name:            id,
		Active:          1,
		EpisodesWatched: progress,
		Kind:            kind,
		Folder:          &folder,
		Days:            []contracts.MobileAnimeDay{{Day: "Monday", Order: 1}},
	}
}

// equalMark reports whether two marks carry the same fact: two absences are equal, and two marks
// are equal only when both the episode and the minutes agree, so neither fact can drift alone.
func equalMark(got, want *lengths.Mark) bool {
	if got == nil || want == nil {
		return got == want
	}
	return *got == *want
}

func TestListEpisodeScheduleMarksOnlyTheRowWhoseNextEpisodeRunsLong(t *testing.T) {
	t.Parallel()

	tv := 0
	movie := 3
	inactive := dayAnime("Inactive", "", 1, &tv)
	inactive.Active = 0
	otherDay := dayAnime("Tuesday", "", 1, &tv)
	otherDay.Days = []contracts.MobileAnimeDay{{Day: "Tuesday", Order: 1}}
	animes := []contracts.MobileAnime{
		inactive,
		otherDay,
		dayAnime("Long", "", 1, &tv),
		dayAnime("Short", "", 1, &tv),
		dayAnime("Movie", "", 1, &movie),
		dayAnime("Unmeasured", "", 1, &tv),
	}
	stored := &storedDurations{byAnime: map[string][]episodes.Duration{
		"Inactive": {durationOf("Inactive", 2, 45*time.Minute)},
		"Tuesday":  {durationOf("Tuesday", 2, 45*time.Minute)},
		"Long":     {durationOf("Long", 1, 24*time.Minute), durationOf("Long", 2, 45*time.Minute)},
		"Short":    {durationOf("Short", 2, 24*time.Minute)},
		"Movie":    {durationOf("Movie", 2, 95*time.Minute)},
	}}
	service := NewEpisodeService(EpisodeServiceDeps{
		Query: scheduleQuery{animes: animes},
		Marks: lengths.NewToday(stored),
	})

	items, err := service.ListEpisodeSchedule(context.Background(), EpisodeScheduleQuery{Day: "Monday"})
	if err != nil {
		t.Fatalf("list schedule: %v", err)
	}
	want := map[string]*lengths.Mark{"Long": {Episode: 2, Minutes: 45}}
	if len(items) != 4 {
		t.Fatalf("one row per active anime of the day: want 4, got %d", len(items))
	}
	for _, item := range items {
		if !equalMark(item.LongNextEpisode, want[item.AnimeID]) {
			t.Errorf("%s: want mark %v, got %v", item.AnimeID, want[item.AnimeID], item.LongNextEpisode)
		}
	}
	if len(stored.asked) != 1 || len(stored.asked[0]) != 4 {
		t.Errorf("the day must be read once, for its own rows only, got %v", stored.asked)
	}
}

func TestListEpisodeScheduleWithoutMarksMarksNothingAndFailsNothing(t *testing.T) {
	t.Parallel()

	tv := 0
	service := NewEpisodeService(EpisodeServiceDeps{
		Query: scheduleQuery{animes: []contracts.MobileAnime{dayAnime("Long", "", 1, &tv)}},
	})

	items, err := service.ListEpisodeSchedule(context.Background(), EpisodeScheduleQuery{Day: "Monday"})
	if err != nil {
		t.Fatalf("an unwired marks source must not fail the read: %v", err)
	}
	if len(items) != 1 || items[0].LongNextEpisode != nil {
		t.Errorf("nothing can be marked without a marks source, got %v", items)
	}
}

// TestListEpisodeScheduleNeverReadsTheFolder pins D7: a long file sitting in the folder with no stored
// duration gives no mark, because opening Today reads only what is stored, and the folder is untouched.
func TestListEpisodeScheduleNeverReadsTheFolder(t *testing.T) {
	t.Parallel()

	tv := 0
	folder := t.TempDir()
	if err := os.WriteFile(filepath.Join(folder, "Show - 02.mp4"), []byte("x"), 0o644); err != nil {
		t.Fatalf("write episode: %v", err)
	}
	service := NewEpisodeService(EpisodeServiceDeps{
		Query: scheduleQuery{animes: []contracts.MobileAnime{dayAnime("Show", folder, 1, &tv)}},
		Marks: lengths.NewToday(&storedDurations{}),
	})

	items, err := service.ListEpisodeSchedule(context.Background(), EpisodeScheduleQuery{Day: "Monday"})
	if err != nil {
		t.Fatalf("list schedule: %v", err)
	}
	if len(items) != 1 || items[0].LongNextEpisode != nil {
		t.Fatalf("an episode with no stored duration must stay unmarked, got %v", items)
	}
	entries, err := os.ReadDir(folder)
	if err != nil || len(entries) != 1 {
		t.Errorf("the folder must be untouched, got %v (%v)", entries, err)
	}
}
