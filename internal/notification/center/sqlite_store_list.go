package center

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const (
	// defaultListLimit and maxListLimit mirror
	// internal/observability/eventlog/types.go's defaultSearchLimit/
	// maxSearchLimit double-clamp: an absent or non-positive limit falls back
	// to the default, and any request above the ceiling is capped, guarding
	// direct in-process callers as well as the eventual Wails binding layer.
	defaultListLimit = 25
	maxListLimit     = 100
)

// notificationRecordSelectColumns is the fixed SELECT column list every
// notification_records query relies on. The trailing correlated subquery is
// what lets the master list report a real action count without loading the
// action bodies it deliberately does not need: it resolves through
// idx_notification_record_actions_notification, whose leading column is
// exactly notification_id.
const notificationRecordSelectColumns = "id, created_at_ms, title, body, level, source, correlation_id, read_at_ms, archived_at_ms, rows_json, " +
	"(SELECT COUNT(*) FROM notification_record_actions WHERE notification_record_actions.notification_id = notification_records.id)"

// List returns a newest-first, keyset-paginated page of records, filtered by
// the requested archive view and, optionally, to unread-only. Deliberately
// does NOT load each item's action BODIES: the master list only needs record
// fields plus a count (design §10's NotificationRow has no action bodies),
// which the select column list gets from a correlated COUNT. Record loads the
// full action set for the single-record detail view.
func (s *Store) List(ctx context.Context, query ListQuery) (Page, error) {
	limit := clampListLimit(query.Limit)
	sqlQuery, args, err := buildListQuery(query, limit)
	if err != nil {
		return Page{}, err
	}

	rows, err := s.db.QueryContext(ctx, sqlQuery, args...)
	if err != nil {
		return Page{}, err
	}
	defer func() { _ = rows.Close() }()

	page, err := scanRecordPage(rows, limit)
	if err != nil {
		return Page{}, err
	}
	return page, rows.Err()
}

// Record loads one persisted notification by id, including its actions in
// ordinal order. found is false, with a nil error, when no row matches id.
func (s *Store) Record(ctx context.Context, id int64) (Record, bool, error) {
	row := s.db.QueryRowContext(ctx, "SELECT "+notificationRecordSelectColumns+" FROM notification_records WHERE id = ?", id)
	record, err := scanNotificationRecordRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Record{}, false, nil
		}
		return Record{}, false, err
	}

	actions, err := s.loadActionsForRecord(ctx, id)
	if err != nil {
		return Record{}, false, err
	}
	record.Actions = actions
	return record, true, nil
}

// clampListLimit applies the reader-side half of the double clamp: an absent
// or non-positive limit falls back to the default, and any request above the
// ceiling is capped.
func clampListLimit(limit int) int {
	if limit <= 0 {
		return defaultListLimit
	}
	if limit > maxListLimit {
		return maxListLimit
	}
	return limit
}

// buildListQuery assembles the newest-first paginated query and its bind
// arguments, composing the view filter, the optional unread-only filter, the
// search/source/level filters (Slice 3b), and the keyset cursor as a
// conjunction. It requests limit+1 rows so the caller can detect a further
// page without a second round trip.
//
// The view filter is deliberately the FIRST WHERE condition: it matches
// idx_notification_records_active's leading column
// (archived_at_ms, created_at_ms DESC, id DESC), so the default active view
// -- every list query's common case -- resolves through that index for both
// the filter and the ORDER BY, never a separate sort step (design §4's index
// justification: "_active serves the active/archived split that every
// default list query filters on"). Search/Sources/Levels sit AFTER the
// existing view/unread-only conditions but still BEFORE the keyset cursor
// predicate, so paging keeps working over the narrowed result set exactly
// like the unfiltered path (proven by
// TestListFilteredKeysetPageNeverRepeatsOrSkips).
func buildListQuery(query ListQuery, limit int) (string, []any, error) {
	sqlQuery := "SELECT " + notificationRecordSelectColumns + " FROM notification_records"
	var conditions []string
	var args []any

	if query.View == ViewArchived {
		conditions = append(conditions, "archived_at_ms IS NOT NULL")
	} else {
		conditions = append(conditions, "archived_at_ms IS NULL")
	}
	if query.UnreadOnly {
		conditions = append(conditions, "read_at_ms IS NULL")
	}
	if trimmedSearch := strings.TrimSpace(query.Search); trimmedSearch != "" {
		likePattern := "%" + escapeLikePattern(trimmedSearch) + "%"
		conditions = append(conditions, "(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')")
		args = append(args, likePattern, likePattern)
	}
	if len(query.Sources) > 0 {
		condition, sourceArgs := stringSetCondition("source", query.Sources)
		conditions = append(conditions, condition)
		args = append(args, sourceArgs...)
	}
	if len(query.Levels) > 0 {
		condition, levelArgs := stringSetCondition("level", query.Levels)
		conditions = append(conditions, condition)
		args = append(args, levelArgs...)
	}
	if query.Cursor != "" {
		cursor, decodeErr := decodeRecordCursor(query.Cursor)
		if decodeErr != nil {
			return "", nil, decodeErr
		}
		conditions = append(conditions, "(created_at_ms < ? OR (created_at_ms = ? AND id < ?))")
		args = append(args, cursor.CreatedAtMS, cursor.CreatedAtMS, cursor.ID)
	}

	sqlQuery += " WHERE " + joinListConditions(conditions)
	sqlQuery += " ORDER BY created_at_ms DESC, id DESC LIMIT ?"
	return sqlQuery, append(args, limit+1), nil
}

// escapeLikePattern escapes SQLite LIKE metacharacters -- '%', '_', and the
// escape character itself -- in a raw user-typed substring, so
// buildListQuery's search filter matches the literal text the user typed
// (e.g. a search for "100%" matches only that literal substring) rather than
// treating '%'/'_' as wildcards. Paired with the query's explicit
// ESCAPE '\' clause: SQLite's LIKE has no escape character by default.
func escapeLikePattern(raw string) string {
	replacer := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`)
	return replacer.Replace(raw)
}

// stringSetCondition builds a "column IN (?, ?, ...)" WHERE fragment and its
// bind args for a non-empty set of string values, mirroring
// sqlite_store_lifecycle.go's idPlaceholders shape. Callers MUST only invoke
// this for a non-empty slice: an empty Sources/Levels filter means "no
// filter requested," never "match nothing," and that guard lives in
// buildListQuery, one level up, not here.
func stringSetCondition(column string, values []string) (string, []any) {
	placeholders := make([]string, len(values))
	args := make([]any, len(values))
	for i, value := range values {
		placeholders[i] = "?"
		args[i] = value
	}
	return column + " IN (" + strings.Join(placeholders, ",") + ")", args
}

// joinListConditions ANDs a set of already-parenthesized-as-needed WHERE
// fragments, mirroring internal/observability/eventlog/reader_search.go's
// joinEventConditions.
func joinListConditions(conditions []string) string {
	joined := ""
	for i, condition := range conditions {
		if i > 0 {
			joined += " AND "
		}
		joined += condition
	}
	return joined
}

// notificationRecordRowScanner is the subset of *sql.Rows / *sql.Row that
// record scanning needs.
type notificationRecordRowScanner interface {
	Scan(dest ...any) error
}

// scanNotificationRecordRow reads one notification_records row into a
// Record, including its ActionCount but leaving Actions themselves unset --
// callers that need the action bodies load them separately via
// loadActionsForRecord.
func scanNotificationRecordRow(scanner notificationRecordRowScanner) (Record, error) {
	var record Record
	var correlationID, rowsJSON sql.NullString
	var readAtMS, archivedAtMS sql.NullInt64
	if err := scanner.Scan(
		&record.ID, &record.CreatedAtMS, &record.Title, &record.Body, &record.Level, &record.Source,
		&correlationID, &readAtMS, &archivedAtMS, &rowsJSON, &record.ActionCount,
	); err != nil {
		return Record{}, err
	}
	if correlationID.Valid {
		record.CorrelationID = correlationID.String
	}
	if readAtMS.Valid {
		record.ReadAtMS = readAtMS.Int64
	}
	if archivedAtMS.Valid {
		record.ArchivedAtMS = archivedAtMS.Int64
	}
	if rowsJSON.Valid {
		var rows []DetailRow
		if err := json.Unmarshal([]byte(rowsJSON.String), &rows); err == nil {
			record.Rows = rows
		}
	}
	return record, nil
}

// recordPageRows is the subset of *sql.Rows the page scan loop needs, kept
// narrow so it is testable without a live database.
type recordPageRows interface {
	Next() bool
	Scan(dest ...any) error
}

// scanRecordPage drains rows into a bounded page, setting the next cursor
// only when the limit+1 probe row proves a further page exists.
func scanRecordPage(rows recordPageRows, limit int) (Page, error) {
	page := Page{Limit: limit, Items: []Record{}}
	for rows.Next() {
		record, err := scanNotificationRecordRow(rows)
		if err != nil {
			return Page{}, err
		}
		if len(page.Items) <= limit {
			page.Items = append(page.Items, record)
		}
	}
	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		last := page.Items[len(page.Items)-1]
		page.NextCursor = encodeRecordCursor(recordCursor{CreatedAtMS: last.CreatedAtMS, ID: last.ID})
	}
	return page, nil
}

// loadActionsForRecord loads notificationID's actions in ordinal order.
func (s *Store) loadActionsForRecord(ctx context.Context, notificationID int64) ([]Action, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, notification_id, row_ref, ordinal, label, intent, args_json, executed_at_ms, refused_reason
		FROM notification_record_actions
		WHERE notification_id = ?
		ORDER BY ordinal ASC
	`, notificationID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var actions []Action
	for rows.Next() {
		action, err := scanNotificationActionRow(rows)
		if err != nil {
			return nil, err
		}
		actions = append(actions, action)
	}
	return actions, rows.Err()
}

// scanNotificationActionRow reads one notification_record_actions row into
// an Action.
func scanNotificationActionRow(scanner notificationRecordRowScanner) (Action, error) {
	var action Action
	var rowRef, refusedReason sql.NullString
	var executedAtMS sql.NullInt64
	var argsJSON string
	if err := scanner.Scan(
		&action.ID, &action.NotificationID, &rowRef, &action.Ordinal, &action.Label, &action.Intent,
		&argsJSON, &executedAtMS, &refusedReason,
	); err != nil {
		return Action{}, err
	}
	if rowRef.Valid {
		action.RowRef = rowRef.String
	}
	if executedAtMS.Valid {
		action.ExecutedAtMS = executedAtMS.Int64
	}
	if refusedReason.Valid {
		action.RefusedReason = RefusalReason(refusedReason.String)
	}
	if err := json.Unmarshal([]byte(argsJSON), &action.Args); err != nil {
		return Action{}, fmt.Errorf("unmarshal action args: %w", err)
	}
	return action, nil
}
