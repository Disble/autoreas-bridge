package identity

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// label is a parsed basename: ordinary ordinal candidates from the name plus
// the first ambiguity marker in scan order.
type label struct {
	ords     []int
	ambig    AmbiguityKind
	hasAmbig bool
}

// setAmbig records the first marker only, so Detail stays deterministic.
func (l *label) setAmbig(a AmbiguityKind) {
	if !l.hasAmbig {
		l.ambig, l.hasAmbig = a, true
	}
}

var (
	specialRe = regexp.MustCompile(`(?i)\b(ova|oad|oav|sp|special|extra|bonus|pv|cm|ncop|nced|preview|trailer|menu|interview)`)
	fracRe    = regexp.MustCompile(`(\d{1,3})\s*\.\s*(\d{1,3})`)
	rangeRe   = regexp.MustCompile(`(\d{1,3})\s*[-–—~～]\s*(\d{1,3})`)
	multiRe   = regexp.MustCompile(`(\d{1,3})\s*[+&＋＆,、/]\s*(\d{1,3})`)
	parenRe   = regexp.MustCompile(`\(\s*(\d{1,3})\s*\)\s*$`)
	tailRe    = regexp.MustCompile(`(?i)(?:^|[\s_\-\.\[\]\(\)【】「】ep]+)(?:ep|episode|e|第)?\s*(\d{1,4})\s*(?:話|话|回|集|v\d+)?\s*$`)
	sxxexxRe  = regexp.MustCompile(`(?i)\bS\d{1,2}\s*E(\d{1,3})\b`)
	cnRe      = regexp.MustCompile(`第\s*(\d{1,3})\s*[話话回集]`)
	tagRe     = regexp.MustCompile(`(?i)^(?:ep|e|episode)?\s*(\d{1,3})$`)
	codecRe   = regexp.MustCompile(`^(h|x|avc|hevc|av1)`)
)

// resolutions are never episode ordinals.
var resolutions = map[string]bool{
	"360": true, "480": true, "576": true, "720": true,
	"1080": true, "2160": true, "4320": true,
}

// parseName parses a basename into conservative claims. A trailing number
// inside a fractional/range/multi span is part of that marker, never a
// standalone ordinal. Years, resolutions, versions and codecs are visible
// noise, never ordinals. Anything else without a delimited numeric candidate
// is opaque.
func parseName(basename string) label {
	stem := stripExtension(basename)
	var l label
	var spans [][2]int
	markSpecial(stem, &l)
	if sp, ok := fractionalSpan(stem); ok {
		spans = append(spans, sp)
		l.setAmbig(AmbiguityFractional)
	}
	if sp, ok := rangeSpan(stem); ok {
		spans = append(spans, sp)
		l.setAmbig(AmbiguityRange)
	}
	if sp, ok := multiSpan(stem); ok {
		spans = append(spans, sp)
		l.setAmbig(AmbiguityMulti)
	}
	markTotalHint(stem, &l)
	appendTailOrdinal(stem, spans, &l)
	appendSeasonOrdinal(stem, &l)
	appendCJKOrdinal(stem, &l)
	l.ords = dedup(l.ords)
	return l
}

// stripExtension drops the final dot suffix, so the grammar reads the stem.
func stripExtension(basename string) string {
	stem := basename
	if i := strings.LastIndex(stem, "."); i >= 0 {
		stem = stem[:i]
	}
	return stem
}

// markSpecial records a special-feature token when the prototype lookahead
// accepts what follows it.
func markSpecial(stem string, l *label) {
	if loc := specialRe.FindStringIndex(stem); loc != nil && specialFollows(stem, loc[1]) {
		l.setAmbig(AmbiguitySpecial)
	}
}

// fractionalSpan returns the span of a fractional marker that is not really
// a version number.
func fractionalSpan(stem string) ([2]int, bool) {
	m := fracRe.FindStringSubmatchIndex(stem)
	if m == nil || versionPrefix(stem, m[0]) {
		return [2]int{}, false
	}
	return [2]int{m[0], m[1]}, true
}

// rangeSpan returns the span of a range marker that starts on a delimiter,
// so a season digit never becomes a range bound.
func rangeSpan(stem string) ([2]int, bool) {
	m := rangeRe.FindStringSubmatchIndex(stem)
	if m == nil || !delimitedStart(stem, m[0]) {
		return [2]int{}, false
	}
	return [2]int{m[0], m[1]}, true
}

// multiSpan returns the span of a multi-episode marker that starts on a
// delimiter.
func multiSpan(stem string) ([2]int, bool) {
	m := multiRe.FindStringSubmatchIndex(stem)
	if m == nil || !delimitedStart(stem, m[0]) {
		return [2]int{}, false
	}
	return [2]int{m[0], m[1]}, true
}

// markTotalHint records a trailing parenthesized total, which is never
// proof of an ordinal.
func markTotalHint(stem string, l *label) {
	if m := parenRe.FindStringSubmatch(stem); m != nil {
		l.setAmbig(AmbiguityTotalHint)
	}
}

// appendTailOrdinal claims the trailing number unless it belongs to a
// marker span or is visible noise: a year, a resolution, a version, or a
// codec token.
func appendTailOrdinal(stem string, spans [][2]int, l *label) {
	m := tailRe.FindStringSubmatchIndex(stem)
	if m == nil {
		return
	}
	raw, start := stem[m[2]:m[3]], m[2]
	if !insideSpan(spans, start) && noiseReason(stem, raw, start) == "" {
		l.ords = append(l.ords, mustAtoi(raw))
	}
}

// appendSeasonOrdinal claims the episode of an SxxExx marker.
func appendSeasonOrdinal(stem string, l *label) {
	if m := sxxexxRe.FindStringSubmatch(stem); m != nil {
		l.ords = append(l.ords, mustAtoi(m[1]))
	}
}

// appendCJKOrdinal claims the episode of a CJK ordinal marker.
func appendCJKOrdinal(stem string, l *label) {
	if m := cnRe.FindStringSubmatch(stem); m != nil {
		l.ords = append(l.ords, mustAtoi(m[1]))
	}
}

// tagOrd returns the ordinal a trimmed explicit tag claims, if any.
func tagOrd(tag string) (int, bool) {
	m := tagRe.FindStringSubmatch(strings.TrimSpace(tag))
	if m == nil {
		return 0, false
	}
	return mustAtoi(m[1]), true
}

// specialFollows reports whether a special token is followed by a digit or a
// word boundary, exactly the prototype lookahead.
func specialFollows(s string, pos int) bool {
	if pos >= len(s) {
		return true
	}
	c := s[pos]
	if c >= '0' && c <= '9' {
		return true
	}
	return !wordByte(c)
}

// wordByte reports whether c continues a word: a letter, a digit or an
// underscore.
func wordByte(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_'
}

// versionPrefix reports whether a fractional match is really a version
// number (v1.2, ver 2.0).
func versionPrefix(s string, idx int) bool {
	from := idx - 4
	if from < 0 {
		from = 0
	}
	before := strings.ToLower(s[from:idx])
	return strings.HasSuffix(before, " v") || strings.HasSuffix(before, "ver") ||
		strings.HasSuffix(strings.TrimSpace(before), "v")
}

// delimitedStart reports whether a range/multi span starts on a delimiter,
// so a season digit never becomes a range bound.
func delimitedStart(s string, idx int) bool {
	if idx <= 0 {
		return true
	}
	r, _ := utf8.DecodeLastRuneInString(s[:idx])
	return unicode.IsSpace(r) || strings.ContainsRune("_-.[]()【】「」", r)
}

// insideSpan reports whether a trailing number belongs to a marker span.
func insideSpan(spans [][2]int, start int) bool {
	for _, sp := range spans {
		if start >= sp[0] && start < sp[1] {
			return true
		}
	}
	return false
}

// noiseReason names why a trailing number is not an ordinal, or "" when the
// number is a genuine candidate.
func noiseReason(s, raw string, start int) string {
	if len(raw) == 4 {
		if y, err := strconv.Atoi(raw); err == nil && y >= 1900 && y <= 2100 {
			return "year"
		}
	}
	if resolutions[raw] {
		return "resolution"
	}
	from := start - 3
	if from < 0 {
		from = 0
	}
	before := strings.ToLower(s[from:start])
	if codecRe.MatchString(before+raw[:1]) && strings.ContainsAny(before, "hx") {
		return "codec"
	}
	if strings.HasSuffix(strings.TrimSpace(before), "v") {
		return "version"
	}
	return ""
}

// mustAtoi converts a regex-captured digit run, which always fits an int.
func mustAtoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// dedup returns the distinct values in first-seen order.
func dedup(in []int) []int {
	seen := map[int]bool{}
	out := in[:0]
	for _, v := range in {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}
