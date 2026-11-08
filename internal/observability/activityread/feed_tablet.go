package activityread

import (
	"context"
	"fmt"
	"strings"

	"autoreas-bridge/internal/observability/telemetry"
)

// attachTabletSummaries sets on each traffic hour line of a page the
// hourly_summary each device reported for that hour (S6 P1). A summary is
// matched by the hour it reports, stored as observed_at_ms, never by when it
// arrived: it arrives after its hour closes, and the main process's data may
// arrive much later with its original hour. The rollup hour is not per device
// (GET /api/status rows carry no device id), so every device's summary of the
// hour belongs to the one line, ordered by device id.
func (r *Reader) attachTabletSummaries(ctx context.Context, lines []FeedLine) error {
	byHour := map[int64]*FeedLine{}
	args := []any{telemetry.KindHourlySummary}
	for i := range lines {
		if hour := lines[i].Traffic; hour != nil {
			byHour[hour.HourStartMS] = &lines[i]
			args = append(args, hour.HourStartMS)
		}
	}
	marks := strings.TrimSuffix(strings.Repeat("?, ", len(byHour)), ", ")
	rows, err := r.db.QueryContext(ctx, `SELECT rowid, device_id, reported_at_ms, observed_at_ms, payload_json
		FROM device_telemetry_events WHERE kind = ? AND observed_at_ms IN (`+marks+`)
		ORDER BY device_id, rowid`, args...)
	if err != nil {
		return fmt.Errorf("activityread: feed tablet summaries: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var tablet TabletSummary
		var hourMS int64
		var payload []byte
		if err := rows.Scan(&tablet.ReportID, &tablet.DeviceID, &tablet.ReceivedAtMS, &hourMS, &payload); err != nil {
			return fmt.Errorf("activityread: scan feed tablet summary: %w", err)
		}
		if tablet.Summary, err = telemetry.ReadHourlySummary(payload); err != nil {
			return fmt.Errorf("activityread: feed tablet summary %d: %w", tablet.ReportID, err)
		}
		line := byHour[hourMS]
		line.TabletSummaries = append(line.TabletSummaries, tablet)
	}
	return rows.Err()
}
