package download

import (
	"fmt"

	"autoreas-bridge/internal/notification"
)

// buildRunDetailRows builds one notification.DetailItem per anime that needs attention -- failed,
// or (defensively; not currently reachable from setRunCompletionStatus's own case ordering, see
// service.go) still carrying an unresolved manual link -- naming each individually. Every anime
// that is neither collapses into a single trailing summary row instead of claiming a row of its
// own (notification-center spec, "Uneventful rows collapse into a single summary line"). A run
// where nothing needs attention and nothing was uneventful returns nil.
func buildRunDetailRows(outcomes []animeRunOutcome) []notification.DetailItem {
	rows := make([]notification.DetailItem, 0, len(outcomes))
	collapsedCount := 0
	for _, outcome := range outcomes {
		if !outcome.failed && len(outcome.manualLinks) == 0 {
			collapsedCount++
			continue
		}
		rows = append(rows, notification.DetailItem{
			RefType: "anime",
			RefID:   outcome.animeID,
			Name:    outcome.animeName,
			Status:  outcomeRowStatus(outcome),
			Detail:  outcomeRowDetail(outcome),
		})
	}
	if collapsedCount > 0 {
		rows = append(rows, notification.DetailItem{
			Status:         "ok",
			Detail:         fmt.Sprintf("%d other anime finished without incident", collapsedCount),
			CollapsedCount: collapsedCount,
		})
	}
	if len(rows) == 0 {
		return nil
	}
	return rows
}

// outcomeRowStatus reports one anime outcome's row status word.
func outcomeRowStatus(outcome animeRunOutcome) string {
	if outcome.failed {
		return "failed"
	}
	return "manual"
}

// outcomeRowDetail reports one anime outcome's row detail line.
func outcomeRowDetail(outcome animeRunOutcome) string {
	if outcome.failed {
		if outcome.episodesFailed > 0 {
			return fmt.Sprintf("%d episode(s) failed (%s)", outcome.episodesFailed, outcome.failureKind)
		}
		return fmt.Sprintf("failed to check for new episodes (%s)", outcome.failureKind)
	}
	return summarizeManualLinks(outcome.manualLinks, manualLinksSummaryLimit)
}
