package activityread

import (
	"context"
	"fmt"
	"slices"

	"autoreas-bridge/internal/observability/syncreading"
)

const (
	// syncStartLimit caps the starts one reading reads, newest first. On the
	// 2026-11-06 copy Bridge started about 10 times a day, so the 90-day
	// retention holds about 900.
	syncStartLimit = 2000
	// syncStartSQL is one Bridge start. Rows stored before the log line gained
	// its event type (2026-10-18 on the copy) are the same fact with a null
	// event_type; without them the failures of that span lose their start.
	syncStartSQL = `domain = 'api' AND level = 'info' AND (event_type = 'api.listening'
		OR (event_type IS NULL AND message LIKE 'http server listening on %'))`
)

// SyncStarts returns the retained Bridge starts, oldest first, each with the
// last contacts it recorded, if any.
func (r *Reader) SyncStarts(ctx context.Context) ([]syncreading.Start, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT occurred_at_ms, COALESCE(metadata_json, '') FROM runtime_events
		WHERE `+syncStartSQL+` ORDER BY occurred_at_ms DESC LIMIT ?`, syncStartLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: sync starts: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var starts []syncreading.Start
	for rows.Next() {
		var atMS int64
		var metadata string
		if err := rows.Scan(&atMS, &metadata); err != nil {
			return nil, fmt.Errorf("activityread: scan sync start: %w", err)
		}
		starts = append(starts, syncreading.DecodeStart(atMS, metadata))
	}
	slices.Reverse(starts)
	return starts, rows.Err()
}
