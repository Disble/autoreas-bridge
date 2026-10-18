package activityread

import (
	"context"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/observability/incident"
)

// Incidents returns the fingerprints with an occurrence in the last 7 days,
// newest first.
func (r *Reader) Incidents(ctx context.Context, in IncidentsInput) ([]IncidentSummary, error) {
	s, err := scopeOf(in.Where)
	if err != nil {
		return nil, err
	}
	return r.incidentSummaries(ctx, in.Now.UnixMilli(), IncidentListSpan, s)
}

// incidentSummaries groups by fingerprint the occurrences within span of
// nowMS. Occurrences counts those within span; FirstSeenAtMS and IsNew look
// at every retained occurrence. The window_start_ms bound lets the query use
// its index: an occurrence's window starts incident.WindowBefore before it.
func (r *Reader) incidentSummaries(ctx context.Context, nowMS int64, span time.Duration, s scope) ([]IncidentSummary, error) {
	sinceMS := nowMS - span.Milliseconds()
	filter, filterArgs := s.incidentFilter()
	query := `WITH recent AS (
			SELECT DISTINCT fingerprint FROM incidents
			WHERE window_start_ms >= ? AND occurred_at_ms >= ? AND occurred_at_ms <= ? AND ` + filter + `
		), ranked AS (
			SELECT id, fingerprint, reason, occurred_at_ms,
				ROW_NUMBER() OVER (PARTITION BY fingerprint ORDER BY occurred_at_ms DESC, id DESC) AS position,
				MIN(occurred_at_ms) OVER (PARTITION BY fingerprint) AS first_ms,
				SUM(CASE WHEN occurred_at_ms >= ? AND occurred_at_ms <= ? THEN 1 ELSE 0 END)
					OVER (PARTITION BY fingerprint) AS recent_count
			FROM incidents WHERE fingerprint IN (SELECT fingerprint FROM recent) AND occurred_at_ms <= ?
		)
		SELECT id, fingerprint, reason, occurred_at_ms, first_ms, recent_count FROM ranked
		WHERE position = 1 ORDER BY occurred_at_ms DESC, id DESC`
	args := append([]any{sinceMS - incident.WindowBefore.Milliseconds(), sinceMS, nowMS}, filterArgs...)
	args = append(args, sinceMS, nowMS, nowMS)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("activityread: incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()
	newSinceMS := nowMS - NewSpan.Milliseconds()
	var summaries []IncidentSummary
	for rows.Next() {
		var sum IncidentSummary
		if err := rows.Scan(&sum.LatestID, &sum.Fingerprint, &sum.Reason, &sum.LatestAtMS, &sum.FirstSeenAtMS,
			&sum.Occurrences); err != nil {
			return nil, fmt.Errorf("activityread: scan incident: %w", err)
		}
		sum.Title = titleFor(sum.Fingerprint, sum.Reason)
		sum.IsNew = sum.FirstSeenAtMS >= newSinceMS
		sum.IsError = isErrorReason(sum.Reason)
		summaries = append(summaries, sum)
	}
	return summaries, rows.Err()
}

// isErrorReason reports whether a reason is an error rather than a slow
// request or a manual pin.
func isErrorReason(reason string) bool {
	return reason != string(incident.ReasonSlow) && reason != string(incident.ReasonManualPin)
}

// titleFor renders a fingerprint in plain words. Fingerprints are built by
// incident.Classify*: reason|transport|kind|status|code for requests,
// error_event|domain|type for events, mobile_failure|kind|phase|cause for
// phone reports.
func titleFor(fingerprint, reason string) string {
	parts := strings.Split(fingerprint, "|")
	part := func(i int) string {
		if i < len(parts) {
			return parts[i]
		}
		return ""
	}
	switch incident.Reason(reason) {
	case incident.ReasonServerError:
		return withCode(subjectOf(part(2))+" failed with a server error "+part(3), part(4))
	case incident.ReasonClientError:
		return withCode(subjectOf(part(2))+" was refused with status "+part(3), part(4))
	case incident.ReasonRejected:
		return withCode(subjectOf(part(2))+" was rejected", part(3))
	case incident.ReasonSlow:
		return subjectOf(part(2)) + " is slow"
	case incident.ReasonMobileFailure:
		if part(1) == "cycle_report" {
			return withCode("The phone's sync cycle failed", part(3))
		}
		return withCode("An episode change failed on the phone", part(3))
	case incident.ReasonErrorEvent:
		return withCode("Error in "+areaOf(part(1)), part(2))
	case incident.ReasonManualPin:
		return "Pinned moment"
	}
	return fingerprint
}

// withCode appends a non-empty code in parentheses.
func withCode(title, code string) string {
	if code == "" {
		return title
	}
	return title + " (" + code + ")"
}

// subjectOf names a capture kind in plain words.
func subjectOf(kind string) string {
	switch kind {
	case "reconcile", "ws_reconcile":
		return "Sync"
	case "get":
		return "A read"
	case "post", "put", "patch", "delete":
		return "A write"
	case "":
		return "A request"
	}
	if strings.HasPrefix(kind, "ws_") {
		return "The live connection"
	}
	return "A " + kind + " request"
}

// areaOf names an event domain in plain words.
func areaOf(domain string) string {
	switch domain {
	case "download":
		return "downloads"
	case "anime":
		return "the editor"
	case "api", "websocket", "sync":
		return "sync"
	case "":
		return "the bridge"
	}
	return domain
}
