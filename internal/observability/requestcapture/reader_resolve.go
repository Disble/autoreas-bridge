package requestcapture

import (
	"context"
	"regexp"
	"strconv"
	"strings"
)

// httpStatusPattern recognizes a bare HTTP status token (1xx-5xx) inside a
// reference string.
var httpStatusPattern = regexp.MustCompile(`\b[1-5]\d\d\b`)

// knownRouteFragments are the route substrings a reference may name directly
// (e.g. "reconcile", "patch") without spelling the full route path.
var knownRouteFragments = []string{"reconcile", "patch"}

// ResolveCandidate is one ranked request matched by a reference.
type ResolveCandidate struct {
	RequestID string `json:"request_id"`
}

// referenceComponents captures the recognized structured pieces of an
// imprecise reference: an HTTP status, a route fragment, a time expression,
// and an anime id. Any subset may be present.
type referenceComponents struct {
	status        *int
	routeFragment string
	timeExpr      string
	animeID       string
	any           bool
}

// parseReferenceComponents tokenizes a normalized reference into its
// recognized structured components.
func parseReferenceComponents(reference string) referenceComponents {
	var components referenceComponents
	if match := httpStatusPattern.FindString(reference); match != "" {
		if value, err := strconv.Atoi(match); err == nil {
			components.status = &value
			components.any = true
		}
	}
	for _, fragment := range knownRouteFragments {
		if strings.Contains(reference, fragment) {
			components.routeFragment = fragment
			components.any = true
			break
		}
	}
	for _, timeWord := range []string{"latest", "today"} {
		if strings.Contains(reference, timeWord) {
			components.timeExpr = timeWord
			components.any = true
			break
		}
	}
	if animeID := extractAnimeIDReference(reference); animeID != "" {
		components.animeID = animeID
		components.any = true
	}
	return components
}

// extractAnimeIDReference extracts an anime id following an "anime" marker
// word, e.g. "reconcile for anime anime-42" -> "anime-42".
func extractAnimeIDReference(reference string) string {
	const marker = "anime "
	_, rest, found := strings.CutLast(reference, marker)
	if !found {
		return ""
	}
	fields := strings.Fields(rest)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

// matchesComponents reports whether item satisfies every recognized
// component of the parsed reference.
func matchesComponents(item CaptureRecord, components referenceComponents) bool {
	if components.status != nil && !matchesStatusComponent(item, *components.status) {
		return false
	}
	if components.routeFragment != "" && !strings.Contains(strings.ToLower(item.Route), components.routeFragment) {
		return false
	}
	if components.animeID != "" && !matchesAnimeIDComponent(item, components.animeID) {
		return false
	}
	return true
}

// matchesStatusComponent reports whether item's HTTP status equals expected.
func matchesStatusComponent(item CaptureRecord, expected int) bool {
	return item.HTTPStatus != nil && *item.HTTPStatus == expected
}

// matchesAnimeIDComponent reports whether item references the given anime id,
// either directly or through one of its correlated operation refs.
func matchesAnimeIDComponent(item CaptureRecord, animeID string) bool {
	if item.AnimeID != nil && *item.AnimeID == animeID {
		return true
	}
	for _, op := range item.Correlations.OperationRefs {
		if op.AnimeID == animeID {
			return true
		}
	}
	return false
}

// Resolve returns request captures that match an imprecise reference.
func (r *Reader) Resolve(ctx context.Context, reference string) ([]ResolveCandidate, error) {
	reference = normalizeReference(reference)
	components := parseReferenceComponents(reference)

	ranked, componentMatches, err := r.collectResolveCandidates(ctx, reference, components)
	if err != nil {
		return nil, err
	}
	return mergeResolveCandidates(ranked, componentMatches), nil
}

// collectResolveCandidates pages through every capture and classifies each
// item into either a structured component match or a rank tier produced by
// captureRank.
func (r *Reader) collectResolveCandidates(ctx context.Context, reference string, components referenceComponents) ([3][]ResolveCandidate, []ResolveCandidate, error) {
	var ranked [3][]ResolveCandidate
	var componentMatches []ResolveCandidate
	for cursor := ""; ; {
		// Summary requests the list projection, which is sufficient here:
		// every field the ranking reads (RequestID, Route, HTTPStatus,
		// AnimeID, Correlations) is a base column the summary projection
		// keeps. It leaves the request/response body and header blobs
		// unread, which the resolve path never looks at and which dominate
		// the read cost when paging the whole table. The page size is the
		// reader's own ceiling (maxSearchLimit) rather than a number
		// invented here: the pager asks for the largest page the reader
		// will serve and follows cursors until the backend stops offering
		// them.
		page, err := r.Search(ctx, SearchParams{Limit: maxSearchLimit, Cursor: cursor, Summary: true})
		if err != nil {
			return ranked, nil, err
		}
		for _, item := range page.Items {
			if components.any && matchesComponents(item, components) {
				componentMatches = append(componentMatches, ResolveCandidate{RequestID: item.RequestID})
			}
			if rank := captureRank(item, reference); rank >= 0 {
				ranked[rank] = append(ranked[rank], ResolveCandidate{RequestID: item.RequestID})
			}
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	return ranked, componentMatches, nil
}

// mergeResolveCandidates flattens the ranked tiers and structured component
// matches into a single deduplicated candidate list, in priority order.
// Exact/device/effect-id matches (ranked[0]/[1]) stay the highest tier;
// structured component matches (status/route/anime) rank above the generic
// substring tier, since they represent a deliberately parsed reference
// rather than an incidental text match.
func mergeResolveCandidates(ranked [3][]ResolveCandidate, componentMatches []ResolveCandidate) []ResolveCandidate {
	result := make([]ResolveCandidate, 0)
	seen := map[string]bool{}
	ordered := append(append(append([]ResolveCandidate(nil), ranked[0]...), ranked[1]...), append(componentMatches, ranked[2]...)...)
	for _, candidate := range ordered {
		if seen[candidate.RequestID] {
			continue
		}
		seen[candidate.RequestID] = true
		result = append(result, candidate)
	}
	return result
}

// captureRank scores how closely a capture record matches the reference string.
func captureRank(item CaptureRecord, reference string) int {
	values := []string{item.RequestID, item.Device.DeviceID, item.Device.Name}
	if item.AnimeID != nil {
		values = append(values, *item.AnimeID)
	}
	for _, id := range append(item.Correlations.ChangelogIDs, item.Correlations.ActivityIDs...) {
		values = append(values, strconv.FormatInt(id, 10))
	}
	for _, op := range item.Correlations.OperationRefs {
		values = append(values, op.AnimeID, op.Operation, op.Outcome)
	}
	values = append(values, item.Correlations.ConflictIDs...)
	rank := -1
	for index, value := range values {
		normalized := normalizeReference(value)
		if normalized == reference {
			return min(index, 1)
		}
		if strings.Contains(normalized, reference) {
			rank = 2
		}
	}
	return rank
}

// normalizeReference lowercases and collapses whitespace for fuzzy matching.
func normalizeReference(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}
