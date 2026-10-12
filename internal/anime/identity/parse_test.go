package identity

import (
	"slices"
	"testing"
)

// TestParseName pins the filename grammar at the seam it feeds: ordinary
// ordinals plus the first ambiguity marker in scan order.
func TestParseName(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name      string
		basename  string
		wantOrds  []int
		wantAmbig AmbiguityKind
	}{
		{name: "clear number", basename: "Mushoku Tensei III 13.mp4", wantOrds: []int{13}},
		{name: "nodash suffix", basename: "Harbor Lights 08.mp4", wantOrds: []int{8}},
		{name: "distorted stem", basename: "teeennnseiishitaaaraaslimeedattaakenn4thseasonsss-24.mp4", wantOrds: []int{24}},
		{name: "season digit is not a range bound", basename: "slime-s4-01.mp4", wantOrds: []int{1}},
		{name: "explicit keyword", basename: "Harbor Lights EP13.mp4", wantOrds: []int{13}},
		{name: "sxxexx", basename: "Show S02E07.mkv", wantOrds: []int{7}},
		{name: "cjk marker", basename: "Show 第13話.mp4", wantOrds: []int{13}},
		{name: "fractional never truncates", basename: "Show - 10.5.mp4", wantAmbig: AmbiguityFractional},
		{name: "range", basename: "Harbor Lights - 07-08.mp4", wantAmbig: AmbiguityRange},
		{name: "range at stem start", basename: "07-08.mp4", wantAmbig: AmbiguityRange},
		{name: "multi", basename: "Harbor Lights - 10+11.mp4", wantAmbig: AmbiguityMulti},
		{name: "special", basename: "Harbor Lights - SP02.mp4", wantOrds: []int{2}, wantAmbig: AmbiguitySpecial},
		{name: "special redefines trailing ordinal", basename: "Show SP - 05.mp4", wantOrds: []int{5}, wantAmbig: AmbiguitySpecial},
		{name: "parenthesized total is not proof", basename: "Date A Live III - 01(24).mp4", wantAmbig: AmbiguityTotalHint},
		{name: "year is noise", basename: "Show 2024.mp4"},
		{name: "year lower bound", basename: "Show 1900.mp4"},
		{name: "year upper bound", basename: "Show 2100.mp4"},
		{name: "resolution is noise", basename: "Show - 1080.mp4"},
		{name: "version is noise", basename: "Show v2.mp4"},
		{name: "codec is noise", basename: "Show x264.mp4"},
		{name: "opaque label", basename: "Evening Becomes Night finale.mp4"},
		{name: "opaque cut", basename: "north-cut.mp4"},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := parseName(tc.basename)
			gotOrds, wantOrds := got.ords, tc.wantOrds
			if len(gotOrds) == 0 {
				gotOrds = nil
			}
			if len(wantOrds) == 0 {
				wantOrds = nil
			}
			if !slices.Equal(gotOrds, wantOrds) {
				t.Errorf("ords = %v, want %v", got.ords, tc.wantOrds)
			}
			if got.hasAmbig != (tc.wantAmbig != "") || got.ambig != tc.wantAmbig {
				t.Errorf("ambig = %v/%v, want %v", got.ambig, got.hasAmbig, tc.wantAmbig)
			}
		})
	}
}

// TestTagOrd pins explicit tag claims: an optional episode keyword plus 1-3
// digits, nothing else.
func TestTagOrd(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		tag  string
		want int
		ok   bool
	}{
		{name: "plain", tag: "13", want: 13, ok: true},
		{name: "keyword", tag: "EP13", want: 13, ok: true},
		{name: "spaced", tag: "e 7", want: 7, ok: true},
		{name: "full word", tag: "episode 12", want: 12, ok: true},
		{name: "prose", tag: "opening", ok: false},
		{name: "four digits", tag: "1234", ok: false},
		{name: "decimal", tag: "13.5", ok: false},
		{name: "empty", tag: "", ok: false},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, ok := tagOrd(tc.tag)
			if got != tc.want || ok != tc.ok {
				t.Errorf("tagOrd(%q) = %v/%v, want %v/%v", tc.tag, got, ok, tc.want, tc.ok)
			}
		})
	}
}
