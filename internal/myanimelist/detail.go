package myanimelist

import (
	"bytes"
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

// anchorTitle, anchorType and anchorStatus are design D2's anchor tier:
// labels present on every anime page regardless of the anime's own
// properties, so their absence can only mean the markup drifted from what
// this parser expects. Only anchorTitle's and anchorType's VALUES are
// used (mapped to Detail.Title and Detail.Type); anchorStatus is
// presence-checked only, and its value is discarded — MyAnimeList's
// Status: reports airing status, a different vocabulary from the bridge
// editor's own watching estado (docs/ubiquitous-language.md).
const (
	anchorTitle  = "title heading"
	anchorType   = "Type:"
	anchorStatus = "Status:"
)

// labelEpisodes, labelDuration, labelSource, labelStudios and labelGenres
// name design D2's Mapped tier: legitimately absent from a page (appended
// to Detail.Unfilled), but present-in-an-unrecognized-shape is drift, not
// silent absence (D2's "third outcome"). Studios:/Studio: and
// Genres:/Genre: both accept a label set (parse.go); the plural form
// names the field in Unfilled either way.
const (
	labelEpisodes = "Episodes:"
	labelDuration = "Duration:"
	labelSource   = "Source:"
	labelStudios  = "Studios:"
	labelGenres   = "Genres:"
)

// episodesUnknownLiteral is MyAnimeList's literal Episodes: text for an
// anime that has not aired long enough to report an episode count — a
// legitimate absence, not a parse failure.
const episodesUnknownLiteral = "Unknown"

// episodesDigitsPattern matches Episodes:'s only other recognized shape:
// one or more ASCII digits. Anything else present under the label is
// markup drift (design D2a's episodes row).
var episodesDigitsPattern = regexp.MustCompile(`^\d+$`)

// firstHeadingText returns the trimmed text of the first <h1> element
// under n, or ok=false when none exists. The <h1> tag alone is used
// deliberately, never the itemprop="name" node that wraps it: on real
// MyAnimeList pages that node also wraps the sibling English-subtitle
// <p>, so reading its full text content would silently fold the subtitle
// into the title (measured against real pages during Slice 2a). The
// first <h1> is unique and correct on every fixture captured for this
// change.
func firstHeadingText(n *html.Node) (title string, ok bool) {
	if n.Type == html.ElementNode && n.Data == "h1" {
		return strings.TrimSpace(textContent(n)), true
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if title, ok := firstHeadingText(c); ok {
			return title, true
		}
	}
	return "", false
}

// mappedEpisodes extracts and validates Episodes:'s Mapped-tier value
// (design D2/D2a). Absence and the literal "Unknown" are both legitimate
// — the label is missing, or the anime has not aired long enough to
// report a count. Any other non-digit shape is markup drift, not a
// fourth legitimate case: unfilled reports exactly two of those three
// outcomes, err reports the third.
func mappedEpisodes(doc *html.Node, url string) (value string, unfilled bool, err error) {
	raw, ok := parseEpisodes(doc)
	if !ok {
		return "", true, nil
	}
	if raw == episodesUnknownLiteral {
		return "", true, nil
	}
	if !episodesDigitsPattern.MatchString(raw) {
		return "", false, &DriftError{Anchor: labelEpisodes, URL: url}
	}
	return raw, false, nil
}

// mappedDuration extracts Duration:'s raw text and converts it to whole
// minutes via parseDurationMinutes (design D2a). Absence is legitimate; a
// present value in neither recognized shape is markup drift (D2's "third
// outcome" — never a silent zero).
func mappedDuration(doc *html.Node, url string) (minutes string, unfilled bool, err error) {
	raw, ok := singleValueField(doc, labelDuration)
	if !ok {
		return "", true, nil
	}
	parsed, ok := parseDurationMinutes(raw)
	if !ok {
		return "", false, &DriftError{Anchor: labelDuration, URL: url}
	}
	return strconv.Itoa(parsed), false, nil
}

// parseDetailPage assembles a Detail from a fetched anime page's parsed
// DOM, or returns a *DriftError naming the first anchor or Mapped-tier
// field whose shape no longer matches this parser's expectations (design
// D2). url only names the page in the returned error; parseDetailPage
// performs no fetch itself, which is what makes it independently
// testable over an in-memory fragment or a real fixture (detail_test.go).
func parseDetailPage(doc *html.Node, url string) (Detail, error) {
	title, ok := firstHeadingText(doc)
	if !ok {
		return Detail{}, &DriftError{Anchor: anchorTitle, URL: url}
	}
	kind, ok := parseType(doc)
	if !ok {
		return Detail{}, &DriftError{Anchor: anchorType, URL: url}
	}
	if !hasLabel(doc, anchorStatus) {
		return Detail{}, &DriftError{Anchor: anchorStatus, URL: url}
	}

	detail := Detail{Title: title, Type: kind}
	var unfilled []string

	episodes, episodesUnfilled, err := mappedEpisodes(doc, url)
	if err != nil {
		return Detail{}, err
	}
	detail.Episodes = episodes
	if episodesUnfilled {
		unfilled = append(unfilled, labelEpisodes)
	}

	duration, durationUnfilled, err := mappedDuration(doc, url)
	if err != nil {
		return Detail{}, err
	}
	detail.Duration = duration
	if durationUnfilled {
		unfilled = append(unfilled, labelDuration)
	}

	if source, ok := parseSource(doc); ok {
		detail.Source = source
	} else {
		unfilled = append(unfilled, labelSource)
	}

	if studios, ok := parseStudios(doc); ok {
		detail.Studios = studios
	} else {
		unfilled = append(unfilled, labelStudios)
	}

	if genres, ok := parseGenres(doc); ok {
		detail.Genres = genres
	} else {
		unfilled = append(unfilled, labelGenres)
	}

	detail.Unfilled = unfilled
	return detail, nil
}

// Detail fetches malID's anime page and parses it into a Detail — the
// only place this package performs a second request beyond Search
// (myanimelist-metadata-source spec, "Two-stage retrieval"). The page URL
// is built from malID alone, never a slug supplied by the caller, so an
// int cannot inject a path segment (design's Interfaces note).
func (c *Client) Detail(ctx context.Context, malID int) (Detail, error) {
	detailURL := fmt.Sprintf("%s/anime/%d", c.baseURL, malID)

	body, err := c.fetch.Fetch(ctx, detailURL)
	if err != nil {
		return Detail{}, fmt.Errorf("myanimelist: detail %d: %w", malID, err)
	}

	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return Detail{}, fmt.Errorf("myanimelist: parse detail page for %d: %w", malID, err)
	}

	return parseDetailPage(doc, detailURL)
}
