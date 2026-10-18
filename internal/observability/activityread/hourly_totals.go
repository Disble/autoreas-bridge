package activityread

import (
	"context"
	"fmt"
	"time"
)

// HourlyTotal is one hourly rollup bucket of one local day: the requests of
// one route template, status class (http_status/100, 0 when absent) and
// device (empty when absent) in the hour starting at HourStartMS.
type HourlyTotal struct {
	HourStartMS   int64
	RouteTemplate string
	StatusClass   int
	DeviceID      string
	Count         int64
	MaxDurationMS int64
}

// HourlyTotals returns the rollup buckets of the local day holding day, in
// day's location, ordered by hour, route, status class and device. The
// grouping is the primary key, whose leading hour_ms column serves the
// day's range; a day without rows is an empty list.
func (r *Reader) HourlyTotals(ctx context.Context, day time.Time) ([]HourlyTotal, error) {
	start := dayStart(day)
	rows, err := r.db.QueryContext(ctx, `SELECT hour_ms, route_template, status_class, device_id,
		SUM(request_count), MAX(max_duration_ms) FROM request_rollup_hourly
		WHERE hour_ms >= ? AND hour_ms < ?
		GROUP BY hour_ms, route_template, status_class, device_id
		ORDER BY hour_ms, route_template, status_class, device_id`,
		start.UnixMilli(), start.AddDate(0, 0, 1).UnixMilli())
	if err != nil {
		return nil, fmt.Errorf("activityread: hourly totals: %w", err)
	}
	defer func() { _ = rows.Close() }()
	totals := []HourlyTotal{}
	for rows.Next() {
		var h HourlyTotal
		if err := rows.Scan(&h.HourStartMS, &h.RouteTemplate, &h.StatusClass, &h.DeviceID, &h.Count, &h.MaxDurationMS); err != nil {
			return nil, fmt.Errorf("activityread: scan hourly total: %w", err)
		}
		totals = append(totals, h)
	}
	return totals, rows.Err()
}
