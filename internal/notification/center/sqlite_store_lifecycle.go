package center

import (
	"context"
	"database/sql"
	"errors"
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

// LoadAction loads one persisted action by id. found is false, with a nil
// error, when no row matches actionID -- distinguished from a query error
// exactly like Store.Record does for a missing notification id.
func (s *Store) LoadAction(ctx context.Context, actionID string) (Action, bool, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, notification_id, row_ref, ordinal, label, intent, args_json, executed_at_ms, refused_reason
		FROM notification_record_actions
		WHERE id = ?
	`, actionID)
	action, err := scanNotificationActionRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Action{}, false, nil
		}
		return Action{}, false, err
	}
	return action, true, nil
}

// StampExecuted stamps executed_at_ms on actionID, but only WHERE it IS
// NULL -- mirroring MarkRead's guard so a redundant call cannot silently
// overwrite the FIRST execution's timestamp (single-fire semantics, design
// §5.2). The Executor already refuses a second press via already_executed
// before ever calling this, so the guard here is defense in depth, not the
// primary enforcement.
func (s *Store) StampExecuted(ctx context.Context, actionID string, atMS int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE notification_record_actions
		SET executed_at_ms = ?
		WHERE id = ? AND executed_at_ms IS NULL
	`, atMS, actionID)
	return err
}

// StampRefused persists actionID's refusal reason so the button stays
// permanently disabled across a restart (design Decision D -- a refusal
// living only in React state would not survive a reload).
func (s *Store) StampRefused(ctx context.Context, actionID string, reason RefusalReason) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE notification_record_actions
		SET refused_reason = ?
		WHERE id = ?
	`, string(reason), actionID)
	return err
}
