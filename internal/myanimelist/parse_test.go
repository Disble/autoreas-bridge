package myanimelist

import (
	"os"
	"reflect"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// parseFixture parses the named testdata file into a DOM, failing the
// test immediately if the file is missing or not well-formed HTML.
func parseFixture(t *testing.T, name string) *html.Node {
	t.Helper()

	body, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("parse fixture %s: %v", name, err)
	}
	return doc
}

// parseFragment parses a minimal HTML snippet (rather than a full page
// fixture) for edge cases too small to warrant their own testdata file.
func parseFragment(t *testing.T, fragment string) *html.Node {
	t.Helper()

	doc, err := html.Parse(strings.NewReader(fragment))
	if err != nil {
		t.Fatalf("parse fragment: %v", err)
	}
	return doc
}

// TestParseTypeExtractsTheAnchorTextVerbatim covers the Type: locator on a
// real TV page, and proves it returns MyAnimeList's raw text with no
// mapping applied — the mapping to the bridge's closed kind enum happens
// outside this module (design D6, Slice 4a).
func TestParseTypeExtractsTheAnchorTextVerbatim(t *testing.T) {
	t.Parallel()

	doc := parseFixture(t, "detail_tv.html")

	value, ok := parseType(doc)
	if !ok {
		t.Fatal("expected Type: to be found")
	}
	if value != "TV" {
		t.Fatalf("expected Type %q, got %q", "TV", value)
	}
}

// TestParseTypeReturnsONAsRawTextUnmapped proves non-negotiable #5: ONA is
// a real MyAnimeList Type: value, and this module returns it faithfully
// with no special-casing — the closed 4-value kind mapping happens in the
// frontend hop (design D6, Slice 4a), never here.
func TestParseTypeReturnsONAsRawTextUnmapped(t *testing.T) {
	t.Parallel()

	doc := parseFixture(t, "detail_ona.html")

	value, ok := parseType(doc)
	if !ok {
		t.Fatal("expected Type: to be found")
	}
	if value != "ONA" {
		t.Fatalf("expected Type %q, got %q", "ONA", value)
	}
}

// TestHasLabelPresenceChecksTheStatusAnchor covers the Status: anchor's
// presence-only role (design D2): detail.go (Slice 2b) uses this to gate
// the fetch without ever reading the value itself.
func TestHasLabelPresenceChecksTheStatusAnchor(t *testing.T) {
	t.Parallel()

	doc := parseFixture(t, "detail_tv.html")

	if !hasLabel(doc, "Status:") {
		t.Fatal("expected Status: to be present")
	}
}

// TestHasLabelReportsAbsenceForALabelNotOnThePage proves hasLabel performs
// an exact label match rather than a prefix/substring match: the singular
// Genre: fixture does not carry the plural Genres: label at all.
func TestHasLabelReportsAbsenceForALabelNotOnThePage(t *testing.T) {
	t.Parallel()

	doc := parseFixture(t, "detail_single_genre.html")

	if hasLabel(doc, "Genres:") {
		t.Fatal("expected the plural Genres: label to be absent from a singular-Genre: page")
	}
}

// TestFindLabelSpanRequiresTheSpanTagAndTheDarkTextClassTogether proves
// the label locator is not satisfied by either the tag name or the class
// alone: a same-text decoy rendered as a different element, or as a span
// with a different class, must never be mistaken for the real label —
// only a real "dark_text" span carries a usable value in its siblings.
func TestFindLabelSpanRequiresTheSpanTagAndTheDarkTextClassTogether(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		fragment string
	}{
		{
			name:     "a non-span element carrying the dark_text class is not the label",
			fragment: `<div class="dark_text">Type:</div>`,
		},
		{
			name:     "a span carrying a different class is not the label",
			fragment: `<span class="not-dark-text">Type:</span>`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := parseFragment(t, tc.fragment)

			if hasLabel(doc, "Type:") {
				t.Fatalf("expected %q to not satisfy the Type: locator", tc.fragment)
			}
		})
	}
}

// TestHasClassFindsTheClassAttributeRegardlessOfItsPositionAmongAttrs
// proves hasClass keeps scanning past a non-"class" attribute rather than
// giving up on the first mismatch: an element with an id attribute
// (or any other) listed before its class attribute must still be found.
func TestHasClassFindsTheClassAttributeRegardlessOfItsPositionAmongAttrs(t *testing.T) {
	t.Parallel()

	doc := parseFragment(t, `<div class="spaceit_pad"><span id="ignored" class="dark_text">Type:</span> <a href="#">TV</a></div>`)

	if !hasLabel(doc, "Type:") {
		t.Fatal("expected the dark_text class to be found even after a preceding, unrelated attribute")
	}
}

// TestParseStudiosFindsAnAnchorNestedInsideAWrapperElement proves the
// anchor search descends into a sibling's descendants rather than only
// checking the sibling itself: an anchor wrapped in an emphasis element
// (unobserved on any captured fixture, but a plausible markup variation)
// must still be found.
func TestParseStudiosFindsAnAnchorNestedInsideAWrapperElement(t *testing.T) {
	t.Parallel()

	doc := parseFragment(t, `<div class="spaceit_pad"><span class="dark_text">Studios:</span><b><a href="#">Wrapped Studio</a></b></div>`)

	studios, ok := parseStudios(doc)
	if !ok {
		t.Fatal("expected the Studios: label to be found")
	}
	if !reflect.DeepEqual(studios, []string{"Wrapped Studio"}) {
		t.Fatalf("expected studios %v, got %v", []string{"Wrapped Studio"}, studios)
	}
}

// TestParseGenresMatchesSingularAndPluralLabels is non-negotiable #1's
// test: the genre locator accepts the label SET {"Genres:","Genre:"}, so
// a single-genre anime rendered with the singular label still yields its
// one genre — the highest-value test in this change. The plural case over
// the same locator proves the set's other member still works, and that
// every listed genre is returned, none dropped and none duplicated from a
// neighboring sibling block.
func TestParseGenresMatchesSingularAndPluralLabels(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		fixture string
		want    []string
	}{
		{
			name:    "singular Genre: label on a single-genre anime still yields a genre",
			fixture: "detail_single_genre.html",
			want:    []string{"Romance"},
		},
		{
			name:    "plural Genres: label on a multi-genre anime yields every listed genre",
			fixture: "detail_tv.html",
			want:    []string{"Action", "Adventure", "Supernatural"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := parseFixture(t, tc.fixture)

			genres, ok := parseGenres(doc)
			if !ok {
				t.Fatal("expected a genre label to be found")
			}
			if !reflect.DeepEqual(genres, tc.want) {
				t.Fatalf("expected genres %v, got %v", tc.want, genres)
			}
		})
	}
}

// TestParseGenresNeverLeaksIntoThemesOrDemographic is explore trap #4:
// Genres:, Themes: and Demographic: render as separate sibling divs
// sharing the same itemprop="genre" markup shape. Extracting Genre:'s
// exact single value (asserted above via reflect.DeepEqual, not just a
// length check) already proves neither "Otaku Culture"/"School" (Themes:)
// nor "Seinen" (Demographic:) leaked in; this test names that guarantee
// explicitly so a regression is diagnosed by name, not just by a
// mismatched slice length.
func TestParseGenresNeverLeaksIntoThemesOrDemographic(t *testing.T) {
	t.Parallel()

	doc := parseFixture(t, "detail_single_genre.html")

	genres, ok := parseGenres(doc)
	if !ok {
		t.Fatal("expected the Genre: label to be found")
	}
	for _, leaked := range []string{"Otaku Culture", "School", "Seinen"} {
		for _, genre := range genres {
			if genre == leaked {
				t.Fatalf("Themes:/Demographic: value %q leaked into the Genre: result %v", leaked, genres)
			}
		}
	}
}

// TestParseStudiosExtractsTheStudioName covers the Studios:/Studio: label
// set. No captured MyAnimeList page ever rendered a singular "Studio:"
// label — every fixture here has exactly one studio and still uses the
// plural "Studios:" — so this test pins the plural form across every
// fixture; the accepted-label set still includes the singular form
// defensively, matching design D1's genre precedent, even though no
// fixture exercises it.
func TestParseStudiosExtractsTheStudioName(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		fixture string
		want    []string
	}{
		{name: "TV fixture", fixture: "detail_tv.html", want: []string{"Studio Pierrot"}},
		{name: "single-genre fixture", fixture: "detail_single_genre.html", want: []string{"CloverWorks"}},
		{name: "movie fixture", fixture: "detail_movie.html", want: []string{"CoMix Wave Films"}},
		{name: "ONA fixture", fixture: "detail_ona.html", want: []string{"Science SARU"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := parseFixture(t, tc.fixture)

			studios, ok := parseStudios(doc)
			if !ok {
				t.Fatal("expected the Studios: label to be found")
			}
			if !reflect.DeepEqual(studios, tc.want) {
				t.Fatalf("expected studios %v, got %v", tc.want, studios)
			}
		})
	}
}

// TestParseSourceHandlesAnchorBareAndPadding is explore trap #3: Source:
// renders as an anchor whose text is padded with literal newlines and
// spaces on some pages, and as plain bare text on others. Both shapes
// must extract to the exact trimmed value, with no leading or trailing
// whitespace surviving either path.
func TestParseSourceHandlesAnchorBareAndPadding(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		fixture string
		want    string
	}{
		{
			name:    "anchor-rendered Source:, text padded with newlines and spaces",
			fixture: "detail_tv.html",
			want:    "Manga",
		},
		{
			name:    "bare-text Source:, no anchor at all",
			fixture: "detail_movie.html",
			want:    "Original",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := parseFixture(t, tc.fixture)

			source, ok := parseSource(doc)
			if !ok {
				t.Fatal("expected the Source: label to be found")
			}
			if source != tc.want {
				t.Fatalf("expected source %q, got %q", tc.want, source)
			}
			if strings.TrimSpace(source) != source {
				t.Fatalf("expected source to carry no leading/trailing whitespace, got %q", source)
			}
		})
	}
}

// TestParseSourceIgnoresBareTextSurroundingAnAnchor proves the anchor
// preference is real, not an accident of extraction order: a bare-text
// prefix/suffix sitting alongside the anchor (unobserved on any captured
// fixture, but not ruled out by the markup shape) must not be folded into
// the result — only the anchor's own text is the value.
func TestParseSourceIgnoresBareTextSurroundingAnAnchor(t *testing.T) {
	t.Parallel()

	doc := parseFragment(t, `<div class="spaceit_pad"><span class="dark_text">Source:</span> Prefix <a href="#">RealValue</a> Suffix</div>`)

	source, ok := parseSource(doc)
	if !ok {
		t.Fatal("expected the Source: label to be found")
	}
	if source != "RealValue" {
		t.Fatalf("expected source %q (anchor text only), got %q", "RealValue", source)
	}
}

// TestParseEpisodesExtractsDigitsAsString covers the Episodes: raw
// extraction across every fixture's numeric episode count. The
// unfilled/drift decision for a non-numeric value is made one layer up,
// in detail.go (Slice 2b) — this module only extracts the raw text.
func TestParseEpisodesExtractsDigitsAsString(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		fixture string
		want    string
	}{
		{name: "TV fixture, 13 episodes", fixture: "detail_tv.html", want: "13"},
		{name: "single-genre fixture, 12 episodes", fixture: "detail_single_genre.html", want: "12"},
		{name: "movie fixture, 1 episode", fixture: "detail_movie.html", want: "1"},
		{name: "ONA fixture, 10 episodes", fixture: "detail_ona.html", want: "10"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := parseFixture(t, tc.fixture)

			episodes, ok := parseEpisodes(doc)
			if !ok {
				t.Fatal("expected the Episodes: label to be found")
			}
			if episodes != tc.want {
				t.Fatalf("expected episodes %q, got %q", tc.want, episodes)
			}
		})
	}
}

// TestParseEpisodesExtractsTheLiteralUnknownAsIs covers a not-yet-aired
// anime's Episodes: value, which MyAnimeList renders as the bare literal
// "Unknown" rather than a digit count. No captured fixture happens to be
// an unaired anime, so this uses a minimal inline fragment instead of a
// fifth full-page fixture — the extractor under test reads any
// well-formed "Episodes:" div, not specifically a captured page. Whether
// "Unknown" is reported as Unfilled or a drift is detail.go's decision
// (Slice 2b); this module only proves the raw text survives unmodified.
func TestParseEpisodesExtractsTheLiteralUnknownAsIs(t *testing.T) {
	t.Parallel()

	doc := parseFragment(t, `<div class="spaceit_pad"><span class="dark_text">Episodes:</span> Unknown </div>`)

	episodes, ok := parseEpisodes(doc)
	if !ok {
		t.Fatal("expected the Episodes: label to be found")
	}
	if episodes != "Unknown" {
		t.Fatalf("expected episodes %q, got %q", "Unknown", episodes)
	}
}

// TestParseEpisodesReportsAbsenceWhenTheLabelIsMissing proves the ok
// return value is false — not an empty string mistaken for "0 episodes"
// — when the Episodes: label does not appear on the page at all.
func TestParseEpisodesReportsAbsenceWhenTheLabelIsMissing(t *testing.T) {
	t.Parallel()

	doc := parseFragment(t, `<div class="spaceit_pad"><span class="dark_text">Type:</span> <a href="#">TV</a></div>`)

	_, ok := parseEpisodes(doc)
	if ok {
		t.Fatal("expected Episodes: to be reported as absent")
	}
}
