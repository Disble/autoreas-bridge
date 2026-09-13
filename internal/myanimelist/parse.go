package myanimelist

import (
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

// darkTextClass is the CSS class MyAnimeList uses on every information-
// block label span (e.g. "Type:", "Genres:", "Source:"). It is the anchor
// this parser locates every field from — design D1's "locate the label
// span, take the rest of its parent div" rule, which is a tree relation
// only a real DOM walk can resolve safely (a regex cannot count nesting
// to find the matching closing div).
const darkTextClass = "dark_text"

// findLabelSpan returns the first "dark_text" span under n whose trimmed
// text exactly matches one of labels, in document order, or ok=false when
// none of the accepted labels appears anywhere in n's subtree. Accepting
// a label SET (rather than one label) is what lets a caller treat
// "Genres:"/"Genre:" or "Studios:"/"Studio:" as interchangeable —
// explore trap #1: a single-genre anime renders the singular form, and a
// locator that only recognizes the plural returns an empty result
// silently.
func findLabelSpan(n *html.Node, labels ...string) (span *html.Node, ok bool) {
	if n.Type == html.ElementNode && n.Data == "span" && hasClass(n, darkTextClass) {
		text := strings.TrimSpace(textContent(n))
		for _, label := range labels {
			if text == label {
				return n, true
			}
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if found, ok := findLabelSpan(c, labels...); ok {
			return found, true
		}
	}
	return nil, false
}

// hasClass reports whether n carries class as one of the space-separated
// tokens in its "class" attribute.
func hasClass(n *html.Node, class string) bool {
	for _, attr := range n.Attr {
		if attr.Key != "class" {
			continue
		}
		for _, token := range strings.Fields(attr.Val) {
			if token == class {
				return true
			}
		}
	}
	return false
}

// textContent concatenates every text node under n, in document order.
func textContent(n *html.Node) string {
	if n.Type == html.TextNode {
		return n.Data
	}
	var b strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		b.WriteString(textContent(c))
	}
	return b.String()
}

// siblingAnchorTexts collects the trimmed text of every <a> element among
// label's following siblings — the "rest of its parent div" this
// parser's field extractors read from. Scoping to siblings, rather than
// the whole document, is what keeps one field's locator from ever
// reading a neighboring field's div: explore trap #4 renders Genres:,
// Themes: and Demographic: as separate sibling divs sharing the same
// itemprop="genre" markup shape, and a NextSibling walk never crosses out
// of the div the matched label itself lives in.
func siblingAnchorTexts(label *html.Node) []string {
	var texts []string
	for n := label.NextSibling; n != nil; n = n.NextSibling {
		collectAnchorTexts(n, &texts)
	}
	return texts
}

// collectAnchorTexts appends the trimmed text of every <a> element under
// n (including n itself) to out, in document order. An anchor's own
// subtree is never descended into further: MyAnimeList never nests an
// anchor inside another one in this parser's fields.
func collectAnchorTexts(n *html.Node, out *[]string) {
	if n.Type == html.ElementNode && n.Data == "a" {
		*out = append(*out, strings.TrimSpace(textContent(n)))
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		collectAnchorTexts(c, out)
	}
}

// siblingBareText concatenates every text node among label's following
// siblings, trimmed — the fallback used when a field renders as plain
// text rather than an anchor. Explore trap #3: Source: renders as bare
// text (e.g. "Original") on some pages and as a newline-padded anchor on
// others; TrimSpace here is what discharges the padding half of that
// trap inside this module, so no caller ever sees the padding.
func siblingBareText(label *html.Node) string {
	var b strings.Builder
	for n := label.NextSibling; n != nil; n = n.NextSibling {
		b.WriteString(textContent(n))
	}
	return strings.TrimSpace(b.String())
}

// fieldValue locates one of labels' span and returns both the anchor
// texts and the bare text found among its following siblings, plus
// whether the label was found at all. Extractors combine these two
// according to each field's known rendering shape.
func fieldValue(doc *html.Node, labels ...string) (anchors []string, bare string, ok bool) {
	label, found := findLabelSpan(doc, labels...)
	if !found {
		return nil, "", false
	}
	return siblingAnchorTexts(label), siblingBareText(label), true
}

// singleValueField extracts one field's scalar value, preferring anchor
// text and falling back to bare text (explore trap #3's two Source:
// shapes), trimmed by both extraction paths. Used for Type:, Source: and
// Episodes:.
func singleValueField(doc *html.Node, labels ...string) (value string, ok bool) {
	anchors, bare, found := fieldValue(doc, labels...)
	if !found {
		return "", false
	}
	if len(anchors) > 0 {
		return anchors[0], true
	}
	return bare, true
}

// joinedAnchorField extracts every anchor-text value under one of
// labels' div — used for Genres:/Genre: and Studios:/Studio:, whose
// label SET is what makes a single-value anime still yield a result
// under the singular form (explore trap #1).
func joinedAnchorField(doc *html.Node, labels ...string) (values []string, ok bool) {
	anchors, _, found := fieldValue(doc, labels...)
	if !found {
		return nil, false
	}
	return anchors, true
}

// hasLabel reports whether any of labels appears as a "dark_text" span
// anywhere in doc, without extracting a value. detail.go (Slice 2b) uses
// it to presence-check the Status: anchor, whose value design D2
// discards once its presence is confirmed.
func hasLabel(doc *html.Node, labels ...string) bool {
	_, found := findLabelSpan(doc, labels...)
	return found
}

// parseType extracts the Type: value verbatim (e.g. "TV", "Movie",
// "ONA"). It applies no mapping: "ONA" is a real value (explore trap #5)
// and the mapping to the bridge's closed kind enum happens outside this
// module (design D6).
func parseType(doc *html.Node) (value string, ok bool) {
	return singleValueField(doc, "Type:")
}

// parseSource extracts the Source: value, preferring anchor text and
// falling back to bare text (explore trap #3), trimmed.
func parseSource(doc *html.Node) (source string, ok bool) {
	return singleValueField(doc, "Source:")
}

// parseEpisodes extracts the raw Episodes: value as MyAnimeList renders
// it — digits, or the literal "Unknown" for an unaired anime. Deciding
// whether a non-numeric value is Unfilled or a parse-drift error is
// detail.go's job (Slice 2b); this function only reports the text and
// whether the label was found at all.
func parseEpisodes(doc *html.Node) (raw string, ok bool) {
	return singleValueField(doc, "Episodes:")
}

// parseGenres extracts every genre named under the Genres:/Genre: label.
// The label SET is what makes the singular form (a single-genre anime)
// still yield a result — explore trap #1, and the highest-value test in
// this change.
func parseGenres(doc *html.Node) (genres []string, ok bool) {
	return joinedAnchorField(doc, "Genres:", "Genre:")
}

// parseStudios extracts every studio named under the Studios:/Studio:
// label, mirroring parseGenres's label-set design. No captured
// MyAnimeList page has been observed using the singular "Studio:" form;
// the set still accepts it defensively, matching the genre precedent.
func parseStudios(doc *html.Node) (studios []string, ok bool) {
	return joinedAnchorField(doc, "Studios:", "Studio:")
}

// durationPattern recognizes MyAnimeList's two known Duration: shapes:
// "N min. per ep." and "H hr. M min.", with either the hour or the
// minute component optional (design D2a). Any other shape — e.g. a
// reworded "N minutes/episode" — matches neither capture group, so
// parseDurationMinutes reports it as ok=false rather than a zero.
var durationPattern = regexp.MustCompile(`^(?:(\d+) hr\.)?(?: ?(\d+) min\.(?: per ep\.)?)?$`)

// parseDurationMinutes converts a MyAnimeList Duration: value into whole
// minutes. An unrecognized shape returns ok=false; the caller raises
// *DriftError, never 0 (design D2's "third outcome" — present-but-
// unparseable is drift, not a silently wrong zero).
func parseDurationMinutes(raw string) (minutes int, ok bool) {
	match := durationPattern.FindStringSubmatch(strings.TrimSpace(raw))
	if match == nil || (match[1] == "" && match[2] == "") {
		return 0, false
	}
	if match[1] != "" {
		hours, err := strconv.Atoi(match[1])
		if err != nil {
			return 0, false
		}
		minutes += hours * 60
	}
	if match[2] != "" {
		mins, err := strconv.Atoi(match[2])
		if err != nil {
			return 0, false
		}
		minutes += mins
	}
	return minutes, true
}
