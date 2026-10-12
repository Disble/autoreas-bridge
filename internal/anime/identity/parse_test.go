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
		// Prototype oracle: parseLabel("e-2.mp4") yields ordinal [2] with no
		// marker (probed with bun); the start-2 lookbehind must clamp to 0.
		{name: "short stem clamps lookbehind", basename: "e-2.mp4", wantOrds: []int{2}},
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

// TestWordByteExhaustive pins the word-continuation predicate over every
// byte value, so each clause of the compound condition earns its kills in
// one loop instead of eighteen rows. The expectation is the ASCII word-char
// definition (letters, digits, underscore), computed independently of the
// production predicate it checks.
func TestWordByteExhaustive(t *testing.T) {
	t.Parallel()
	for c := 0; c < 256; c++ {
		b := byte(c)
		want := b == '_' || b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9'
		if got := wordByte(b); got != want {
			t.Errorf("wordByte(%d) = %v, want %v", c, got, want)
		}
	}
}

// TestStripExtension pins the stem split: only the final dot suffix goes,
// so dotted prefixes survive and a leading dot leaves an empty stem.
func TestStripExtension(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		in   string
		want string
	}{
		{name: "drops the final suffix", in: "Show - 13.mp4", want: "Show - 13"},
		{name: "no dot is unchanged", in: "Show - 13", want: "Show - 13"},
		{name: "drops only the final suffix", in: "archive.tar.mp4", want: "archive.tar"},
		{name: "trailing dot is dropped", in: "Show.", want: "Show"},
		{name: "leading dot leaves empty stem", in: ".mp4", want: ""},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := stripExtension(tc.in); got != tc.want {
				t.Errorf("stripExtension(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestDelimitedStart pins where a range/multi span may begin: stem start,
// whitespace, or a bracket-like delimiter — never mid-word, and the rune
// before the span is the last one even behind multibyte prefixes.
func TestDelimitedStart(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		s    string
		idx  int
		want bool
	}{
		{name: "stem start delimits", s: "07-08", idx: 0, want: true},
		{name: "space delimits", s: "Show 01-02", idx: 5, want: true},
		{name: "hyphen delimits", s: "Show-01-02", idx: 5, want: true},
		{name: "letter does not delimit", s: "abc4+5", idx: 3, want: false},
		{name: "multibyte prefix reads last rune", s: "é 01-02", idx: 3, want: true},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := delimitedStart(tc.s, tc.idx); got != tc.want {
				t.Errorf("delimitedStart(%q, %d) = %v, want %v", tc.s, tc.idx, got, tc.want)
			}
		})
	}
}

// TestInsideSpan pins the marker-span membership: the span start belongs,
// the span end does not, and an empty span contains nothing.
func TestInsideSpan(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name  string
		spans [][2]int
		start int
		want  bool
	}{
		{name: "span start is inside", spans: [][2]int{{3, 8}}, start: 3, want: true},
		{name: "span middle is inside", spans: [][2]int{{3, 8}}, start: 5, want: true},
		{name: "span end is outside", spans: [][2]int{{3, 8}}, start: 8, want: false},
		{name: "before span is outside", spans: [][2]int{{3, 8}}, start: 2, want: false},
		{name: "after span is outside", spans: [][2]int{{3, 8}}, start: 9, want: false},
		{name: "empty spans contain nothing", spans: nil, start: 3, want: false},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := insideSpan(tc.spans, tc.start); got != tc.want {
				t.Errorf("insideSpan(%v, %d) = %v, want %v", tc.spans, tc.start, got, tc.want)
			}
		})
	}
}

// TestNoiseReason pins why a trailing number is not an ordinal: a year
// inside 1900..2100, a resolution, a codec token with h or x nearby (and
// only then — the conjunction needs both halves), or a version suffix.
func TestNoiseReason(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name  string
		s     string
		raw   string
		start int
		want  string
	}{
		{name: "year", s: "Show 2024", raw: "2024", start: 5, want: "year"},
		{name: "below year window claims", s: "Show 1899", raw: "1899", start: 5, want: ""},
		{name: "above year window claims", s: "Show 2101", raw: "2101", start: 5, want: ""},
		{name: "resolution", s: "Show - 1080", raw: "1080", start: 7, want: "resolution"},
		{name: "codec with x nearby", s: "xh 264", raw: "264", start: 3, want: "codec"},
		{name: "codec prefix without h or x claims", s: "avc264", raw: "264", start: 3, want: ""},
		{name: "nearby x without codec prefix claims", s: " x.264", raw: "264", start: 3, want: ""},
		{name: "ordinary number claims", s: "Show - 13", raw: "13", start: 7, want: ""},
		{name: "version suffix", s: "Show v 2", raw: "2", start: 7, want: "version"},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := noiseReason(tc.s, tc.raw, tc.start); got != tc.want {
				t.Errorf("noiseReason(%q, %q, %d) = %q, want %q", tc.s, tc.raw, tc.start, got, tc.want)
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
