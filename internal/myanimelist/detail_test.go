package myanimelist

import (
	"errors"
	"reflect"
	"slices"
	"testing"
)

// anchorsOnlyFragment carries only design D2's three anchor-tier labels
// (title heading, Type:, Status:), with no Mapped-tier field at all. It
// is the base fragment the mapped-field assembly tests build on, so each
// test isolates exactly one field's behavior instead of also exercising
// the anchor gate.
const anchorsOnlyFragment = `<h1>Placeholder Anime</h1>
<div class="spaceit_pad"><span class="dark_text">Type:</span> <a href="#">TV</a></div>
<div class="spaceit_pad"><span class="dark_text">Status:</span> Finished Airing</div>`

// TestFirstHeadingTextRequiresTheH1ElementNotJustMatchingText proves the
// element-type check inside firstHeadingText is load-bearing, not
// redundant with the Data=="h1" comparison: a text node whose own
// content happens to be the literal string "h1" (but is not an <h1>
// element at all) must never be mistaken for the title heading.
func TestFirstHeadingTextRequiresTheH1ElementNotJustMatchingText(t *testing.T) {
	t.Parallel()

	doc := parseFragment(t, `<div>h1</div>`)

	if _, ok := firstHeadingText(doc); ok {
		t.Fatal("expected no <h1> element to be found when only a text node's content matches \"h1\"")
	}
}

// TestDetailMissingTypeAnchorReturnsDriftErrorAndZeroFields is
// non-negotiable #3, the drift trap this whole contract exists to
// prevent: a real page (detail_tv.html) doctored to remove only its
// Type: label/value block must abort with a *DriftError naming "Type:",
// writing zero fields — never a partially filled Detail.
func TestDetailMissingTypeAnchorReturnsDriftErrorAndZeroFields(t *testing.T) {
	t.Parallel()

	doc := parseFixture(t, "detail_drift.html")

	detail, err := parseDetailPage(doc, "https://myanimelist.net/anime/41467")

	var driftErr *DriftError
	if !errors.As(err, &driftErr) {
		t.Fatalf("expected a *DriftError, got %v", err)
	}
	if driftErr.Anchor != "Type:" {
		t.Fatalf("expected anchor %q, got %q", "Type:", driftErr.Anchor)
	}
	if !reflect.DeepEqual(detail, Detail{}) {
		t.Fatalf("expected a zero Detail on drift, got %+v", detail)
	}
}

// TestParseDetailPageMissingAnchorAbortsWithDriftError covers all three
// design D2 anchor-tier labels going missing one at a time over a minimal
// fragment, proving each is checked independently rather than only the
// first one (Type:, pinned above over a real fixture) being wired.
func TestParseDetailPageMissingAnchorAbortsWithDriftError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		fragment string
		anchor   string
	}{
		{
			name:     "title heading missing",
			fragment: `<div class="spaceit_pad"><span class="dark_text">Type:</span> <a href="#">TV</a></div><div class="spaceit_pad"><span class="dark_text">Status:</span> Finished Airing</div>`,
			anchor:   anchorTitle,
		},
		{
			name:     "Type: missing",
			fragment: `<h1>Placeholder</h1><div class="spaceit_pad"><span class="dark_text">Status:</span> Finished Airing</div>`,
			anchor:   anchorType,
		},
		{
			name:     "Status: missing",
			fragment: `<h1>Placeholder</h1><div class="spaceit_pad"><span class="dark_text">Type:</span> <a href="#">TV</a></div>`,
			anchor:   anchorStatus,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := parseFragment(t, tc.fragment)

			detail, err := parseDetailPage(doc, "https://myanimelist.example/anime/1")

			var driftErr *DriftError
			if !errors.As(err, &driftErr) {
				t.Fatalf("expected a *DriftError, got %v", err)
			}
			if driftErr.Anchor != tc.anchor {
				t.Fatalf("expected anchor %q, got %q", tc.anchor, driftErr.Anchor)
			}
			if !reflect.DeepEqual(detail, Detail{}) {
				t.Fatalf("expected a zero Detail on drift, got %+v", detail)
			}
		})
	}
}

// TestParseDetailPageAbsentMappedFieldsAppendToUnfilled covers design
// D2's Mapped tier absence outcome: a legitimately absent field is left
// empty and named in Unfilled, never defaulted. All five Mapped-tier
// labels are absent from anchorsOnlyFragment, so this proves the whole
// set, not just one field.
func TestParseDetailPageAbsentMappedFieldsAppendToUnfilled(t *testing.T) {
	t.Parallel()

	doc := parseFragment(t, anchorsOnlyFragment)

	detail, err := parseDetailPage(doc, "https://myanimelist.example/anime/1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if detail.Episodes != "" || detail.Duration != "" || detail.Source != "" {
		t.Fatalf("expected absent scalar fields to stay empty, got %+v", detail)
	}
	if len(detail.Studios) != 0 || len(detail.Genres) != 0 {
		t.Fatalf("expected absent list fields to stay empty, got %+v", detail)
	}
	for _, label := range []string{labelEpisodes, labelDuration, labelSource, labelStudios, labelGenres} {
		if !slices.Contains(detail.Unfilled, label) {
			t.Fatalf("expected %q in Unfilled, got %v", label, detail.Unfilled)
		}
	}
}

// TestParseDetailPageUnparseableDurationReturnsDriftError is design D2's
// "third outcome": a reworded Duration: shape is present but matches
// neither known pattern, so it must return a *DriftError naming
// "Duration:" and never a zero (the failure this contract exists to
// prevent).
func TestParseDetailPageUnparseableDurationReturnsDriftError(t *testing.T) {
	t.Parallel()

	fragment := anchorsOnlyFragment + `
<div class="spaceit_pad"><span class="dark_text">Duration:</span> 24 minutes/episode</div>`
	doc := parseFragment(t, fragment)

	_, err := parseDetailPage(doc, "https://myanimelist.example/anime/1")

	var driftErr *DriftError
	if !errors.As(err, &driftErr) {
		t.Fatalf("expected a *DriftError, got %v", err)
	}
	if driftErr.Anchor != "Duration:" {
		t.Fatalf("expected anchor %q, got %q", "Duration:", driftErr.Anchor)
	}
}

// TestParseDetailPageUnparseableEpisodesReturnsDriftError extends the
// third-outcome trap to Episodes:: a value that is neither digits nor
// the literal "Unknown" is drift, not a legitimate third state.
func TestParseDetailPageUnparseableEpisodesReturnsDriftError(t *testing.T) {
	t.Parallel()

	fragment := anchorsOnlyFragment + `
<div class="spaceit_pad"><span class="dark_text">Episodes:</span> TBD</div>`
	doc := parseFragment(t, fragment)

	_, err := parseDetailPage(doc, "https://myanimelist.example/anime/1")

	var driftErr *DriftError
	if !errors.As(err, &driftErr) {
		t.Fatalf("expected a *DriftError, got %v", err)
	}
	if driftErr.Anchor != "Episodes:" {
		t.Fatalf("expected anchor %q, got %q", "Episodes:", driftErr.Anchor)
	}
}

// TestParseDetailPageEpisodesUnknownLiteralIsUnfilledNotDrift proves the
// literal "Unknown" is the one legitimate non-digit Episodes: value
// (design D2/D2a): it is reported as unfilled, not as drift.
func TestParseDetailPageEpisodesUnknownLiteralIsUnfilledNotDrift(t *testing.T) {
	t.Parallel()

	fragment := anchorsOnlyFragment + `
<div class="spaceit_pad"><span class="dark_text">Episodes:</span> Unknown</div>`
	doc := parseFragment(t, fragment)

	detail, err := parseDetailPage(doc, "https://myanimelist.example/anime/1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if detail.Episodes != "" {
		t.Fatalf("expected episodes to stay empty for the Unknown literal, got %q", detail.Episodes)
	}
	if !slices.Contains(detail.Unfilled, labelEpisodes) {
		t.Fatalf("expected %q in Unfilled, got %v", labelEpisodes, detail.Unfilled)
	}
}

// TestParseDetailPageOverRealFixturesFillsEveryMappedField is the
// positive counterpart to the absence/drift tests above: every real
// fixture's Mapped-tier fields are present and recognized, so none of
// them appear in Unfilled and every value matches what parse.go's own
// per-field tests already pin.
func TestParseDetailPageOverRealFixturesFillsEveryMappedField(t *testing.T) {
	t.Parallel()

	// want is compared against the whole parsed Detail in one
	// reflect.DeepEqual, rather than one if-check per field: folding
	// seven per-field comparisons into the loop body is what pushed this
	// test past the cognitive-complexity ceiling during MUTATE/REFACTOR.
	// An unset Unfilled here is the zero value (nil), matching a fully-
	// formed page's Unfilled staying nil.
	cases := []struct {
		name    string
		fixture string
		want    Detail
	}{
		{
			name:    "TV fixture",
			fixture: "detail_tv.html",
			want: Detail{
				Title:    "Bleach: Sennen Kessen-hen",
				Type:     "TV",
				Episodes: "13",
				Duration: "24",
				Source:   "Manga",
				Studios:  []string{"Studio Pierrot"},
				Genres:   []string{"Action", "Adventure", "Supernatural"},
			},
		},
		{
			name:    "single-genre fixture",
			fixture: "detail_single_genre.html",
			want: Detail{
				Title:    "Sono Bisque Doll wa Koi wo Suru",
				Type:     "TV",
				Episodes: "12",
				Duration: "23",
				Source:   "Manga",
				Studios:  []string{"CloverWorks"},
				Genres:   []string{"Romance"},
			},
		},
		{
			name:    "movie fixture",
			fixture: "detail_movie.html",
			want: Detail{
				Title:    "Kimi no Na wa.",
				Type:     "Movie",
				Episodes: "1",
				Duration: "106",
				Source:   "Original",
				Studios:  []string{"CoMix Wave Films"},
				Genres:   []string{"Award Winning", "Drama"},
			},
		},
		{
			name:    "ONA fixture",
			fixture: "detail_ona.html",
			want: Detail{
				Title:    "Devilman: Crybaby",
				Type:     "ONA",
				Episodes: "10",
				Duration: "24",
				Source:   "Manga",
				Studios:  []string{"Science SARU"},
				Genres:   []string{"Action", "Avant Garde", "Horror", "Supernatural"},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := parseFixture(t, tc.fixture)

			detail, err := parseDetailPage(doc, "https://myanimelist.net/anime/1")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(detail, tc.want) {
				t.Fatalf("expected %+v, got %+v", tc.want, detail)
			}
		})
	}
}
