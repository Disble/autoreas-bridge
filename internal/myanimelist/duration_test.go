package myanimelist

import "testing"

// TestParseDurationMinutesTablePerDesignD2a pins every row of design
// D2a's exact table. The "1 hr. 46 min." row is the load-bearing one: the
// obvious bug — taking the first integer in the string — would return 1,
// a plausible-looking duration that passes any assertion phrased only as
// "a duration was parsed". The literal 106 is written here directly
// (60*1 + 46 computed once, at test-writing time), never re-derived from
// a production constant or expression (CLAUDE.md § 16).
func TestParseDurationMinutesTablePerDesignD2a(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		raw         string
		wantMinutes int
		wantOK      bool
	}{
		{name: "per-episode minutes only", raw: "24 min. per ep.", wantMinutes: 24, wantOK: true},
		{name: "hour and minute, hour component not dropped", raw: "1 hr. 46 min.", wantMinutes: 106, wantOK: true},
		{name: "hours alone still multiply", raw: "2 hr.", wantMinutes: 120, wantOK: true},
		{name: "two-digit minute carry", raw: "2 hr. 5 min.", wantMinutes: 125, wantOK: true},
		{name: "minutes only, no per-episode suffix", raw: "46 min.", wantMinutes: 46, wantOK: true},
		{name: "reworded shape is drift, not zero", raw: "24 minutes/episode", wantMinutes: 0, wantOK: false},
		{name: "unrelated literal is drift, not zero", raw: "Unknown", wantMinutes: 0, wantOK: false},
		{name: "empty string matches neither shape", raw: "", wantMinutes: 0, wantOK: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			minutes, ok := parseDurationMinutes(tc.raw)

			if ok != tc.wantOK {
				t.Fatalf("parseDurationMinutes(%q): ok = %v, want %v", tc.raw, ok, tc.wantOK)
			}
			if minutes != tc.wantMinutes {
				t.Fatalf("parseDurationMinutes(%q): minutes = %d, want %d", tc.raw, minutes, tc.wantMinutes)
			}
		})
	}
}

// TestParseDurationMinutesOverRealFixtures proves parseDurationMinutes
// against the exact Duration: text two real captured pages render, not
// only a hand-written table: detail_movie.html carries the load-bearing
// "1 hr. 46 min." shape, and detail_tv.html carries the per-episode
// shape.
func TestParseDurationMinutesOverRealFixtures(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		fixture     string
		wantMinutes int
	}{
		{name: "movie fixture: 1 hr. 46 min.", fixture: "detail_movie.html", wantMinutes: 106},
		{name: "TV fixture: 24 min. per ep.", fixture: "detail_tv.html", wantMinutes: 24},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := parseFixture(t, tc.fixture)

			raw, ok := singleValueField(doc, "Duration:")
			if !ok {
				t.Fatal("expected the Duration: label to be found")
			}

			minutes, ok := parseDurationMinutes(raw)
			if !ok {
				t.Fatalf("expected Duration: %q to parse", raw)
			}
			if minutes != tc.wantMinutes {
				t.Fatalf("expected %d minutes, got %d", tc.wantMinutes, minutes)
			}
		})
	}
}
