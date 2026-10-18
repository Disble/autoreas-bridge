package activityread

import (
	"context"
	"fmt"
	"math"
	"strconv"

	"autoreas-bridge/internal/activity"
)

// changeOf converts a stored record to the view shape.
func changeOf(record activity.Record) Change {
	change := Change{
		ID: record.ID, AtMS: record.OccurredAtMs, Source: record.Source, ActionType: record.ActionType,
		AnimeID: record.AnimeID, AnimeName: record.AnimeName, CorrelationID: record.CorrelationID,
		BeforeJSON: string(record.BeforeJSON), AfterJSON: string(record.AfterJSON),
	}
	if record.ReportedAtMS != 0 {
		reported := record.ReportedAtMS
		change.ReportedAtMS = &reported
	}
	return change
}

// todayChanges counts the changes since midnight and returns the latest
// RecentChangesLimit within the ledger span, both bounded by nowMS.
func (r *Reader) todayChanges(ctx context.Context, midnightMS, nowMS int64) (int64, []Change, error) {
	today, err := r.changes.CountMatching(ctx, activity.ListQuery{SinceMS: midnightMS, UntilMS: nowMS})
	if err != nil {
		return 0, nil, fmt.Errorf("activityread: changes today: %w", err)
	}
	records, err := r.changes.ListRecent(ctx, activity.ListQuery{
		Limit: RecentChangesLimit, SinceMS: nowMS - LedgerSpan.Milliseconds(), UntilMS: nowMS,
	})
	if err != nil {
		return 0, nil, fmt.Errorf("activityread: recent changes: %w", err)
	}
	recent := make([]Change, len(records))
	for i, record := range records {
		recent[i] = changeOf(record)
	}
	return today, recent, nil
}

// changeBefore translates a merged cursor into the domain history's own
// position, with the same reading as keyset: a source ranked below the
// cursor's keeps its rows of the cursor's millisecond, one ranked above
// drops them.
func changeBefore(c *cursor) (*activity.Position, error) {
	if c == nil {
		return nil, nil
	}
	switch {
	case rankChange < c.rank:
		return &activity.Position{OccurredAtMs: c.atMS, ID: math.MaxInt64}, nil
	case rankChange > c.rank:
		return &activity.Position{OccurredAtMs: c.atMS, ID: math.MinInt64}, nil
	}
	id, err := strconv.ParseInt(c.key, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("activityread: malformed cursor id %q: %w", c.key, err)
	}
	return &activity.Position{OccurredAtMs: c.atMS, ID: id}, nil
}
