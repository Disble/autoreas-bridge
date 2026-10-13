package lengths

import (
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
)

// stored builds the stored durations of one anime, one per (episode, runtime) pair in order.
func stored(pairs ...any) []episodes.Duration {
	durations := make([]episodes.Duration, 0, len(pairs)/2)
	for i := 0; i < len(pairs); i += 2 {
		durations = append(durations, episodes.Duration{
			AnimeID:    "show",
			Episode:    pairs[i].(int),
			DurationMS: pairs[i+1].(time.Duration).Milliseconds(),
			Source:     episodes.SourceMeasured,
		})
	}
	return durations
}

// kindOf returns a stored type value.
func kindOf(kind int) *int { return &kind }

// equalMark reports whether two marks carry the same fact: two absences are equal, and two marks
// are equal only when both the episode and the minutes agree.
func equalMark(got, want *Mark) bool {
	if got == nil || want == nil {
		return got == want
	}
	return *got == *want
}

func TestLongNextEpisode(t *testing.T) {
	t.Parallel()

	threeEpisodes := stored(1, 24*time.Minute, 2, 24*time.Minute, 3, 45*time.Minute)
	for _, tc := range []struct {
		name      string
		durations []episodes.Duration
		kind      *int
		progress  float64
		want      *Mark
	}{
		{name: "a long next episode is marked with its number and minutes", durations: threeEpisodes,
			kind: kindOf(TVKind), progress: 2, want: &Mark{Episode: 3, Minutes: 45}},
		{name: "the stored type 0 is Anime (TV) and qualifies", durations: threeEpisodes, kind: kindOf(0),
			progress: 2, want: &Mark{Episode: 3, Minutes: 45}},
		{name: "an ordinary next episode is not marked", durations: threeEpisodes, kind: kindOf(TVKind), progress: 1},
		{name: "a short next episode is not marked", durations: stored(1, 12*time.Minute, 2, 12*time.Minute),
			kind: kindOf(TVKind), progress: 1},
		{name: "a long watched episode is not the next one", durations: threeEpisodes, kind: kindOf(TVKind),
			progress: 3},
		{name: "an anime that is not TV is never marked", durations: threeEpisodes, kind: kindOf(3), progress: 2},
		{name: "an anime with no stored type is never marked", durations: threeEpisodes, kind: nil, progress: 2},
		{name: "a next episode with no stored duration is not marked", durations: stored(1, 45*time.Minute),
			kind: kindOf(TVKind), progress: 1},
		{name: "an anime with no stored durations is not marked", kind: kindOf(TVKind), progress: 0},
		{name: "fractional progress names no next episode", durations: threeEpisodes, kind: kindOf(TVKind),
			progress: 2.5},
		{name: "no progress yet marks the first episode", durations: stored(1, 31*time.Minute),
			kind: kindOf(TVKind), progress: 0, want: &Mark{Episode: 1, Minutes: 31}},
		{name: "an episode added before its file is found by number", durations: stored(7, 46*time.Minute),
			kind: kindOf(TVKind), progress: 6, want: &Mark{Episode: 7, Minutes: 46}},
		{name: "exactly thirty minutes is not long", durations: stored(1, 30*time.Minute), kind: kindOf(TVKind)},
		{name: "one millisecond over thirty minutes is long",
			durations: stored(1, 30*time.Minute+time.Millisecond), kind: kindOf(TVKind),
			want: &Mark{Episode: 1, Minutes: 30}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := LongNextEpisode(tc.durations, tc.kind, tc.progress)
			if !equalMark(got, tc.want) {
				t.Fatalf("want %v, got %v", tc.want, got)
			}
		})
	}
}

func TestEpisodeLengths(t *testing.T) {
	t.Parallel()

	durations := stored(1, 24*time.Minute, 2, 45*time.Minute+29*time.Second, 3, 12*time.Minute+30*time.Second)

	t.Run("a TV anime lists every episode in order and marks only the long ones", func(t *testing.T) {
		t.Parallel()

		got := EpisodeLengths(durations, kindOf(TVKind))
		want := []Length{{Episode: 1, Minutes: 24}, {Episode: 2, Minutes: 45, Long: true}, {Episode: 3, Minutes: 13}}
		assertLengths(t, got, want)
	})

	t.Run("an anime that is not TV lists its episodes and marks none long", func(t *testing.T) {
		t.Parallel()

		got := EpisodeLengths(durations, kindOf(1))
		want := []Length{{Episode: 1, Minutes: 24}, {Episode: 2, Minutes: 45}, {Episode: 3, Minutes: 13}}
		assertLengths(t, got, want)
	})

	t.Run("an anime with no stored type marks none long", func(t *testing.T) {
		t.Parallel()

		got := EpisodeLengths(durations, nil)
		want := []Length{{Episode: 1, Minutes: 24}, {Episode: 2, Minutes: 45}, {Episode: 3, Minutes: 13}}
		assertLengths(t, got, want)
	})

	t.Run("no stored durations list nothing", func(t *testing.T) {
		t.Parallel()

		if got := EpisodeLengths(nil, kindOf(TVKind)); len(got) != 0 {
			t.Fatalf("want no lengths, got %v", got)
		}
	})
}

// assertLengths compares two length lists element by element.
func assertLengths(t *testing.T, got, want []Length) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("want %d lengths, got %d: %v", len(want), len(got), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("length %d: want %+v, got %+v", i, want[i], got[i])
		}
	}
}

func TestWholeMinutes(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		runtime time.Duration
		want    int
	}{
		{runtime: 45 * time.Minute, want: 45},
		{runtime: 45*time.Minute + 29*time.Second, want: 45},
		{runtime: 45*time.Minute + 30*time.Second, want: 46},
		{runtime: 29 * time.Second, want: 0},
	} {
		if got := WholeMinutes(tc.runtime); got != tc.want {
			t.Errorf("WholeMinutes(%v): want %d, got %d", tc.runtime, tc.want, got)
		}
	}
}
