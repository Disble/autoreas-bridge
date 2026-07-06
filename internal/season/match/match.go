// Package match provides pure name-matching for the season intake: normalizing
// hand-typed anime names, extracting season/part markers, scoring similarity,
// and resolving a search result set to matched / ambiguous / not_found. It has
// no I/O and is fixture/golden-tested in isolation.
package match

import (
	"regexp"
	"sort"
	"strings"
)

// MatchStatus is the outcome of resolving one intake name against candidates.
type MatchStatus string

const (
	StatusMatched   MatchStatus = "matched"
	StatusAmbiguous MatchStatus = "ambiguous"
	StatusNotFound  MatchStatus = "not_found"
)

// Candidate is one search result to match against.
type Candidate struct {
	Title   string
	PageURL string
}

// ScoredCandidate is a candidate with its similarity score (0..1).
type ScoredCandidate struct {
	Candidate
	Score float64
}

// Resolution is the result of Resolve: a status, the matched page URL (only when
// matched), and the ranked candidates above the display floor.
type Resolution struct {
	Status      MatchStatus
	MatchedSlug string
	Candidates  []ScoredCandidate
}

const (
	// autoMatchScore is the minimum adjusted score for an automatic match.
	autoMatchScore = 0.93
	// autoMatchMargin is the minimum adjusted-score lead over the runner-up.
	autoMatchMargin = 0.10
	// candidateFloor is the minimum raw score for a candidate to be shown at all.
	candidateFloor = 0.55
	// markerPenalty disqualifies a season/part-marker mismatch from auto-match.
	markerPenalty = 0.5
)

var (
	bracketSuffixPattern = regexp.MustCompile(`\[[^\]]*\]`)
	nonAlphaNumPattern   = regexp.MustCompile(`[^a-z0-9]+`)

	ordinalSeasonPattern = regexp.MustCompile(`(\d+)\s*(?:st|nd|rd|th)\s+season`)
	seasonNumberPattern  = regexp.MustCompile(`season\s+(\d+)`)
	partNumberPattern    = regexp.MustCompile(`part\s+(\d+)`)
	shortSeasonPattern   = regexp.MustCompile(`\bs(\d+)\b`)
)

// Normalize folds an anime name to a comparable key: bracket suffixes removed,
// lowercased, accents folded, and every non-alphanumeric character stripped
// (spacing and punctuation differences must not affect matching).
func Normalize(name string) string {
	s := bracketSuffixPattern.ReplaceAllString(name, "")
	s = strings.ToLower(s)
	s = strings.Map(foldAccent, s)
	return nonAlphaNumPattern.ReplaceAllString(s, "")
}

// foldAccent maps common accented runes to their ASCII base; other runes pass
// through unchanged.
func foldAccent(r rune) rune {
	switch r {
	case 'á', 'à', 'ä', 'â', 'ã', 'å':
		return 'a'
	case 'é', 'è', 'ë', 'ê':
		return 'e'
	case 'í', 'ì', 'ï', 'î':
		return 'i'
	case 'ó', 'ò', 'ö', 'ô', 'õ':
		return 'o'
	case 'ú', 'ù', 'ü', 'û':
		return 'u'
	case 'ñ':
		return 'n'
	case 'ç':
		return 'c'
	default:
		return r
	}
}

// ExtractSeasonMarkers returns the sorted, de-duplicated season/part markers in
// a name (e.g. "part3", "season4"). Only numeric/ordinal season vocabulary is a
// marker; subtitles like "New World" and bracket episode counts are not.
func ExtractSeasonMarkers(name string) []string {
	s := strings.ToLower(name)
	set := map[string]struct{}{}
	for _, m := range ordinalSeasonPattern.FindAllStringSubmatch(s, -1) {
		set["season"+m[1]] = struct{}{}
	}
	for _, m := range seasonNumberPattern.FindAllStringSubmatch(s, -1) {
		set["season"+m[1]] = struct{}{}
	}
	for _, m := range shortSeasonPattern.FindAllStringSubmatch(s, -1) {
		set["season"+m[1]] = struct{}{}
	}
	for _, m := range partNumberPattern.FindAllStringSubmatch(s, -1) {
		set["part"+m[1]] = struct{}{}
	}
	if len(set) == 0 {
		return nil
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Score is the trigram Dice coefficient (0..1) of two ALREADY-NORMALIZED
// strings. Identical inputs score 1.0; fully disjoint inputs score 0.0.
func Score(a, b string) float64 {
	ta, tb := trigrams(a), trigrams(b)
	if len(ta) == 0 || len(tb) == 0 {
		if a == b {
			return 1.0
		}
		return 0.0
	}
	inter := 0
	for g := range ta {
		if _, ok := tb[g]; ok {
			inter++
		}
	}
	return 2 * float64(inter) / float64(len(ta)+len(tb))
}

func trigrams(s string) map[string]struct{} {
	set := map[string]struct{}{}
	if len(s) == 0 {
		return set
	}
	if len(s) < 3 {
		set[s] = struct{}{}
		return set
	}
	for i := 0; i+3 <= len(s); i++ {
		set[s[i:i+3]] = struct{}{}
	}
	return set
}

// Resolve scores every candidate against the query and decides the outcome:
// an automatic match requires a clear winner (adjusted score >= autoMatchScore
// with a margin over the runner-up) whose season markers match the query; a
// season/part mismatch is penalized out of auto-match but kept for ranking.
func Resolve(query string, candidates []Candidate) Resolution {
	qn := Normalize(query)
	qm := markerKey(ExtractSeasonMarkers(query))

	type scored struct {
		c   Candidate
		raw float64
		adj float64
	}
	list := make([]scored, 0, len(candidates))
	for _, c := range candidates {
		raw := Score(qn, Normalize(c.Title))
		adj := raw
		if markerKey(ExtractSeasonMarkers(c.Title)) != qm {
			adj -= markerPenalty
		}
		list = append(list, scored{c: c, raw: raw, adj: adj})
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].adj > list[j].adj })

	display := make([]ScoredCandidate, 0, len(list))
	for _, s := range list {
		if s.raw >= candidateFloor {
			display = append(display, ScoredCandidate{Candidate: s.c, Score: s.raw})
		}
	}
	if len(display) == 0 {
		return Resolution{Status: StatusNotFound}
	}

	top := list[0]
	matched := top.adj >= autoMatchScore
	if matched && len(list) > 1 && top.adj-list[1].adj < autoMatchMargin {
		matched = false
	}
	if matched {
		return Resolution{Status: StatusMatched, MatchedSlug: top.c.PageURL, Candidates: display}
	}
	return Resolution{Status: StatusAmbiguous, Candidates: display}
}

// markerKey joins a marker set into a stable comparison key.
func markerKey(markers []string) string {
	return strings.Join(markers, "|")
}
