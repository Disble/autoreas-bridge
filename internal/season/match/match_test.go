package match

import (
	"math"
	"testing"
)

func TestNormalize(t *testing.T) {
	cases := map[string]string{
		"Dr. STONE: SCIENCE FUTURE Part 3":   "drstonesciencefuturepart3",
		"Akane-banashi[5]":                   "akanebanashi",
		"Replica datte, Koi wo Suru[4]":      "replicadattekoiwosuru",
		"Otaku ni Yasashii Gal wa Inai!?[3]": "otakuniyasashiigalwainai",
		"MARRIAGETOXIN":                      "marriagetoxin",
		"Niñas   con   Acción":               "ninasconaccion",
	}
	for in, want := range cases {
		if got := Normalize(in); got != want {
			t.Fatalf("Normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestExtractSeasonMarkers(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"Dr. Stone: Science Future Part 3", []string{"part3"}},
		{"Re:Zero kara Hajimeru Isekai Seikatsu 4th Season", []string{"season4"}},
		{"Tensei Shitara Slime Datta Ken 4th Season", []string{"season4"}},
		{"Some Anime Season 2", []string{"season2"}},
		{"Some Anime S2", []string{"season2"}},
		{"Akane-banashi[5]", nil},
		{"Dr. Stone: New World", nil},
	}
	for _, tc := range cases {
		got := ExtractSeasonMarkers(tc.in)
		if len(got) != len(tc.want) {
			t.Fatalf("ExtractSeasonMarkers(%q) = %v, want %v", tc.in, got, tc.want)
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Fatalf("ExtractSeasonMarkers(%q) = %v, want %v", tc.in, got, tc.want)
			}
		}
	}
}

func TestScore(t *testing.T) {
	if s := Score("drstone", "drstone"); s != 1.0 {
		t.Fatalf("identical score = %v, want 1.0", s)
	}
	if s := Score("drstone", "totallydifferent"); s != 0.0 {
		t.Fatalf("disjoint score = %v, want 0.0", s)
	}
	// "drstone" (5 trigrams) vs "drstonenewworld" (13): Dice = 2*5/18 ≈ 0.5556.
	if s := Score("drstone", "drstonenewworld"); math.Abs(s-0.5556) > 0.01 {
		t.Fatalf("partial score = %v, want ~0.5556", s)
	}
}

// TestScoreDegenerateInputs triangulates the empty and sub-trigram (<3 char)
// branches of Score/trigrams: both are the paths auto-matching hits for very
// short titles (e.g. "K", "Gto"), where the Dice trigram set degenerates.
func TestScoreDegenerateInputs(t *testing.T) {
	cases := []struct {
		name string
		a, b string
		want float64
	}{
		{name: "both empty are identical", a: "", b: "", want: 1.0},
		{name: "empty vs non-empty is disjoint", a: "", b: "naruto", want: 0.0},
		{name: "non-empty vs empty is disjoint", a: "gto", b: "", want: 0.0},
		{name: "equal two-char strings match fully", a: "ai", b: "ai", want: 1.0},
		{name: "different two-char strings are disjoint", a: "ai", b: "gt", want: 0.0},
		{name: "equal single-char strings match fully", a: "k", b: "k", want: 1.0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Score(tc.a, tc.b); got != tc.want {
				t.Fatalf("Score(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
			}
		})
	}
}

// TestNormalizeFoldsEveryAccent triangulates foldAccent across every accented
// vowel variant plus ñ/ç, so Spanish/romanized titles ("Pokémon", "Ñoño")
// normalize to the same key regardless of diacritics.
func TestNormalizeFoldsEveryAccent(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"áàäâãå", "aaaaaa"},
		{"éèëê", "eeee"},
		{"íìïî", "iiii"},
		{"óòöôõ", "ooooo"},
		{"úùüû", "uuuu"},
		{"ñç", "nc"},
		{"Pokémon", "pokemon"},
		{"Ñoño", "nono"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := Normalize(tc.in); got != tc.want {
				t.Fatalf("Normalize(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestResolveExactSingleWinnerMatches(t *testing.T) {
	res := Resolve("Dr. Stone: Science Future Part 3", []Candidate{
		{Title: "Dr. Stone: Science Future Part 3", PageURL: "https://jkanime.net/dr-stone-science-future-part-3/"},
		{Title: "Dr. Stone: Science Future Part 2", PageURL: "https://jkanime.net/dr-stone-science-future-part-2/"},
		{Title: "Dr. Stone: Science Future", PageURL: "https://jkanime.net/dr-stone-science-future/"},
		{Title: "Dr. Stone", PageURL: "https://jkanime.net/dr-stone/"},
	})
	if res.Status != StatusMatched {
		t.Fatalf("status = %q, want matched (%+v)", res.Status, res)
	}
	if res.MatchedSlug != "https://jkanime.net/dr-stone-science-future-part-3/" {
		t.Fatalf("matched slug = %q", res.MatchedSlug)
	}
}

func TestResolveSeasonMarkerMismatchNotAutoMatched(t *testing.T) {
	// Query wants Part 3, but only Part 2 exists: high text similarity must NOT
	// auto-match a different season/part.
	res := Resolve("Dr. Stone: Science Future Part 3", []Candidate{
		{Title: "Dr. Stone: Science Future Part 2", PageURL: "https://jkanime.net/dr-stone-science-future-part-2/"},
	})
	if res.Status == StatusMatched {
		t.Fatalf("must not auto-match a season-marker mismatch, got %+v", res)
	}
}

func TestResolveNotFoundBelowFloor(t *testing.T) {
	res := Resolve("Completely Unrelated Title", []Candidate{
		{Title: "Dr. Stone", PageURL: "https://jkanime.net/dr-stone/"},
	})
	if res.Status != StatusNotFound {
		t.Fatalf("status = %q, want not_found (%+v)", res.Status, res)
	}
	if len(res.Candidates) != 0 {
		t.Fatalf("not_found must return no candidates, got %+v", res.Candidates)
	}
}

func TestResolveAmbiguousReturnsRankedCandidates(t *testing.T) {
	// Two close matches with matching (empty) markers → ambiguous, ranked desc.
	res := Resolve("Sword Art", []Candidate{
		{Title: "Sword Art Online", PageURL: "https://jkanime.net/sword-art-online/"},
		{Title: "Sword Art Offline", PageURL: "https://jkanime.net/sword-art-offline/"},
	})
	if res.Status != StatusAmbiguous {
		t.Fatalf("status = %q, want ambiguous (%+v)", res.Status, res)
	}
	if len(res.Candidates) < 2 {
		t.Fatalf("ambiguous must return the ranked candidates, got %+v", res.Candidates)
	}
	if res.Candidates[0].Score < res.Candidates[1].Score {
		t.Fatalf("candidates must be ranked by score desc: %+v", res.Candidates)
	}
}
