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

// Page anchors distinguish an anime page from unrelated or truncated HTML.
// Optional metadata never makes an otherwise recognizable page fail.
const (
	anchorTitle  = "title heading"
	anchorType   = "Type:"
	anchorStatus = "Status:"
)

// Optional labels name fields left empty when unavailable or unrecognized.
const (
	labelEpisodes = "Episodes:"
	labelDuration = "Duration:"
	labelSource   = "Source:"
	labelStudios  = "Studios:"
	labelGenres   = "Genres:"
)

// episodesDigitsPattern recognizes a usable episode count.
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

// mappedEpisodes leaves unavailable or unrecognized episode counts empty.
// An absent label yields empty text, which episodesDigitsPattern rejects, so
// absence and an unrecognized shape take the same path.
func mappedEpisodes(doc *html.Node) (value string, unfilled bool) {
	raw, _ := parseEpisodes(doc)
	if episodesDigitsPattern.MatchString(raw) {
		return raw, false
	}
	return "", true
}

// mappedDuration returns whole minutes, or leaves unavailable values empty.
func mappedDuration(doc *html.Node) (minutes string, unfilled bool) {
	raw, _ := singleValueField(doc, labelDuration)
	parsed, ok := parseDurationMinutes(raw)
	if ok {
		return strconv.Itoa(parsed), false
	}
	return "", true
}

// parseDetailPage preserves usable metadata and skips unavailable fields.
// Only a missing page anchor aborts retrieval with a DriftError.
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

	episodes, episodesUnfilled := mappedEpisodes(doc)
	detail.Episodes = episodes
	if episodesUnfilled {
		unfilled = append(unfilled, labelEpisodes)
	}

	duration, durationUnfilled := mappedDuration(doc)
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
