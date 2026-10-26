package anime_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/persistence"
)

// sectionMoveCase is one row of the section rule table; an empty want expects an error.
type sectionMoveCase struct {
	name    string
	desired string
	to      string
	err     error
	want    string
}

// TestSectionMoveRuleRewritesOnlyWhatItsTargetNames pins the section rule: a
// named section replaces the days and keeps the last-watched instant, an empty
// one keeps the snapshot byte for byte, and a target failure or an unreadable
// snapshot fails the save. The target sees the first section and the progress.
func TestSectionMoveRuleRewritesOnlyWhatItsTargetNames(t *testing.T) {
	const saved = `{"id":"anime-1","name":"Show","episodesWatched":1,"lastWatchedAt":1700000000000,"days":[{"day":"Ver hoy","order":3}]}`
	for _, tc := range []sectionMoveCase{
		{"named section", saved, "Visto", nil, `{"days":[{"day":"Visto","order":1}],"episodesWatched":1,"id":"anime-1","lastWatchedAt":1700000000000,"name":"Show"}`},
		{"no section", saved, "", nil, saved},
		{"target failure", saved, "Visto", errors.New("season read failed"), ""},
		{"unreadable snapshot", `{"id":`, "Visto", nil, ""},
		{"no days", `{"id":"anime-1","name":"Show","episodesWatched":1}`, "", nil, `{"id":"anime-1","name":"Show","episodesWatched":1}`},
	} {
		t.Run(tc.name, func(t *testing.T) { assertSectionMove(t, tc) })
	}
}

// assertSectionMove runs the section rule for one case and checks its result
// and what its target saw.
func assertSectionMove(t *testing.T, tc sectionMoveCase) {
	t.Helper()
	var seen []any
	rule := anime.NewSectionMoveRule(func(_ context.Context, _ persistence.Querier, animeID, section string, progress float64) (string, error) {
		seen = []any{animeID, section, progress}
		return tc.to, tc.err
	})

	got, err := rule(context.Background(), nil, "anime-1", []byte(tc.desired))

	if tc.want == "" {
		if err == nil {
			t.Fatalf("rule = %s, want an error", got)
		}
		return
	}
	if err != nil || string(got) != tc.want {
		t.Fatalf("rule = %s, %v; want %s", got, err, tc.want)
	}
	wantSection := ""
	if strings.Contains(tc.desired, `"Ver hoy"`) {
		wantSection = "Ver hoy"
	}
	if len(seen) != 3 || seen[0] != "anime-1" || seen[1] != wantSection || seen[2] != float64(1) {
		t.Fatalf("target saw %v, want [anime-1 %q 1]", seen, wantSection)
	}
}
