package center

import (
	"context"
	"strings"
)

// idPlaceholders renders count "?" placeholders and the matching []any bind
// arguments for an IN (...) clause over ids.
func idPlaceholders(ids []int64) (string, []any) {
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	return strings.Join(placeholders, ","), args
}

// UnreadCount returns how many records are currently unread, resolving
// through idx_notification_records_unread's partial shape
// (WHERE read_at_ms IS NULL). This is what the rail badge reads.
func (s *Store) UnreadCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notification_records WHERE read_at_ms IS NULL`).Scan(&count)
	return count, err
}

// TotalEverRecorded returns the total number of records currently stored,
// with no view/read/archive filter -- design §10's NotificationPage.TotalEver
// distinguishes "nothing has ever been recorded" (empty state 1) from
// "records exist but none match the current filter" (empty state 2). Not
// named in design §5.6's signature list; added as the minimal, unambiguous
// closure the DTO built in task 2.2.6 requires.
func (s *Store) TotalEverRecorded(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notification_records`).Scan(&count)
	return count, err
}

// MarkRead stamps read_at_ms on the given ids, but only where it IS NULL --
// so marking the same record read twice cannot decrement the unread count
// twice. Returns the number of rows actually transitioned from unread to
// read.
func (s *Store) MarkRead(ctx context.Context, ids []int64, atMS int64) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	placeholders, idArgs := idPlaceholders(ids)
	args := append([]any{atMS}, idArgs...)
	result, err := s.db.ExecContext(ctx, `
		UPDATE notification_records
		SET read_at_ms = ?
		WHERE read_at_ms IS NULL AND id IN (`+placeholders+`)
	`, args...)
	if err != nil {
		return 0, err
	}
	affected, err := result.RowsAffected()
	return int(affected), err
}

// Archive stamps archived_at_ms on the given ids and, in the same
// transaction, stamps read_at_ms on any of those rows still unread --
// archiving an unread record marks it read (design §5.6, notification-center
// spec "Archiving a record removes it from the default active list"). The
// returned affected count reflects the archive transition, not the
// read-marking side effect.
func (s *Store) Archive(ctx context.Context, ids []int64, atMS int64) (affected int, err error) {
	if len(ids) == 0 {
		return 0, nil
	}
	placeholders, idArgs := idPlaceholders(ids)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	result, err := tx.ExecContext(ctx, `
		UPDATE notification_records
		SET archived_at_ms = ?
		WHERE archived_at_ms IS NULL AND id IN (`+placeholders+`)
	`, append([]any{atMS}, idArgs...)...)
	if err != nil {
		return 0, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}

	if _, err = tx.ExecContext(ctx, `
		UPDATE notification_records
		SET read_at_ms = ?
		WHERE read_at_ms IS NULL AND id IN (`+placeholders+`)
	`, append([]any{atMS}, idArgs...)...); err != nil {
		return 0, err
	}

	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return int(rowsAffected), nil
}

// Restore clears archived_at_ms on the given ids and deliberately does NOT
// touch read_at_ms: a restored record does not become unread again (design
// §5.6 -- "you already saw it").
func (s *Store) Restore(ctx context.Context, ids []int64) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	placeholders, args := idPlaceholders(ids)
	result, err := s.db.ExecContext(ctx, `
		UPDATE notification_records
		SET archived_at_ms = NULL
		WHERE archived_at_ms IS NOT NULL AND id IN (`+placeholders+`)
	`, args...)
	if err != nil {
		return 0, err
	}
	affected, err := result.RowsAffected()
	return int(affected), err
}
