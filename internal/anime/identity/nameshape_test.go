package identity

import (
	"slices"
	"testing"
)

// TestNameShapes pins the recognition guards at the parse seam: the ordinal
// candidates plus the first ambiguity marker, never wording. Expectations
// below were read off the TypeScript prototype (parse.ts), not the Go port:
// a row where Go disagrees with the prototype is a port bug, not an
// expectation to update.
func TestNameShapes(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name      string
		basename  string
		wantOrds  []int
		wantAmbig AmbiguityKind
	}{
		{name: "plain numbered", basename: "Show - 13.mp4", wantOrds: []int{13}},
		{name: "below year range claims", basename: "Show 1899.mp4", wantOrds: []int{1899}},
		{name: "above year range claims", basename: "Show 2101.mp4", wantOrds: []int{2101}},
		{name: "resolution with suffix is noise", basename: "Show 1080p.mp4"},
		{name: "version prefix suppresses fractional", basename: "Show v5.1.mp4", wantOrds: []int{1}},
		{name: "ver with space is fractional", basename: "ver 2.0.mp4", wantAmbig: AmbiguityFractional},
		{name: "undelimited multi stays opaque", basename: "abc4+5.mp4"},
		{name: "special followed by letter is plain", basename: "Show specials 05.mp4", wantOrds: []int{5}},
		{name: "bare special", basename: "Show SP.mp4", wantAmbig: AmbiguitySpecial},
		{name: "multi at stem start", basename: "10+11.mp4", wantAmbig: AmbiguityMulti},
		{name: "range after hyphen", basename: "Show-01-02.mp4", wantAmbig: AmbiguityRange},
		{name: "special followed by zero", basename: "Show SP0.mp4", wantOrds: []int{0}, wantAmbig: AmbiguitySpecial},
		{name: "special followed by nine", basename: "Show SP9.mp4", wantOrds: []int{9}, wantAmbig: AmbiguitySpecial},
		{name: "bare v prefix suppresses fractional", basename: "v1.2.mp4", wantOrds: []int{2}},
		{name: "uppercase version prefix", basename: "Show V1.2.mp4", wantOrds: []int{2}},
		{name: "ver glued to digits is a version", basename: "aver1.2.mp4", wantOrds: []int{2}},
		{name: "v spaced from digits is version noise", basename: "Show v 2.mp4"},
		{name: "trailing digits after ep prefix", basename: "Show ep264.mp4", wantOrds: []int{264}},
		{name: "single-letter multi stays opaque", basename: "a4+5.mp4"},
		{name: "stem-beginning ordinal claims", basename: "13.mp4", wantOrds: []int{13}},
		{name: "narrow version gap suppresses fractional", basename: "Show v   1.2.mp4", wantOrds: []int{2}},
		{name: "wide version gap is fractional", basename: "Show v    1.2.mp4", wantAmbig: AmbiguityFractional},
	}
	for _, tc := range rows {
		got := parseName(tc.basename)
		gotOrds, wantOrds := got.ords, tc.wantOrds
		if len(gotOrds) == 0 {
			gotOrds = nil
		}
		if len(wantOrds) == 0 {
			wantOrds = nil
		}
		if !slices.Equal(gotOrds, wantOrds) {
			t.Errorf("%s: ords = %v, want %v", tc.name, got.ords, tc.wantOrds)
		}
		if got.hasAmbig != (tc.wantAmbig != "") || got.ambig != tc.wantAmbig {
			t.Errorf("%s: ambig = %v/%v, want %v", tc.name, got.ambig, got.hasAmbig, tc.wantAmbig)
		}
	}
}
