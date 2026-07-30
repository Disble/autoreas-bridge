package eventlog

import "strings"

// EventFilters is the runtime-event filter set. It shares only correlation
// id, entity id, and the time window with requestcapture.SearchFilters --
// events have no route, status, outcome, kind, or device, and requests have
// no domain or level. Every populated field composes as a conjunction (AND).
type EventFilters struct {
	Domain        string
	Level         string
	EventType     string
	CorrelationID string
	EntityID      string
	Text          string // free text over message, domain, event_type
	StartMS       *int64
	EndMS         *int64
}

// whereClause builds the conjunctive WHERE fragment (without the leading
// "WHERE") and its bound arguments for the populated filters. An empty
// EventFilters yields an empty clause and nil args, matching
// requestcapture.SearchFilters.whereClause.
func (f EventFilters) whereClause() (string, []any) {
	var clauses []string
	var args []any

	if f.Domain != "" {
		clauses = append(clauses, "domain = ?")
		args = append(args, f.Domain)
	}
	if f.Level != "" {
		clauses = append(clauses, "level = ?")
		args = append(args, f.Level)
	}
	if f.EventType != "" {
		clauses = append(clauses, "event_type = ?")
		args = append(args, f.EventType)
	}
	if f.CorrelationID != "" {
		clauses = append(clauses, "correlation_id = ?")
		args = append(args, f.CorrelationID)
	}
	if f.EntityID != "" {
		clauses = append(clauses, "entity_id = ?")
		args = append(args, f.EntityID)
	}
	if f.StartMS != nil {
		clauses = append(clauses, "occurred_at_ms >= ?")
		args = append(args, *f.StartMS)
	}
	if f.EndMS != nil {
		clauses = append(clauses, "occurred_at_ms <= ?")
		args = append(args, *f.EndMS)
	}
	if f.Text != "" {
		like := "%" + f.Text + "%"
		clauses = append(clauses, "(message LIKE ? OR domain LIKE ? OR event_type LIKE ?)")
		args = append(args, like, like, like)
	}

	if len(clauses) == 0 {
		return "", nil
	}
	return strings.Join(clauses, " AND "), args
}
