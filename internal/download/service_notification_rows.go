package download

import (
	"fmt"

	"autoreas-bridge/internal/notification"
)

// buildRunDetailRows builds one notification.DetailItem per anime the run has something to say
// about, naming each individually, and folds the rest into a single trailing summary row
// (notification-center spec, "Uneventful rows collapse into a single summary line").
//
// An anime is worth naming when it failed, when it left an unresolved manual link, OR when it
// actually downloaded episodes. That last one used to be missing, and it is what made a fully
// successful run's detail pane read as empty: every anime collapsed, so the only row left was a
// summary line about anime the user was never told the names of. The design canvas draws a
// `Downloaded` row on its own run_completed example for exactly this reason -- on a run where
// nothing needs attention, what downloaded IS what needs showing.
//
// What still collapses is the genuinely boring outcome: checked with nothing new, already up to
// date, or skipped. A run where every anime is one of those returns only the summary row; a run
// with no outcomes at all returns nil.
func buildRunDetailRows(outcomes []animeRunOutcome) []notification.DetailItem {
	rows := make([]notification.DetailItem, 0, len(outcomes))
	collapsedCount := 0
	for _, outcome := range outcomes {
		if isUneventfulOutcome(outcome) {
			collapsedCount++
			continue
		}
		rows = append(rows, notification.DetailItem{
			RefType: animeRefType,
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

// isUneventfulOutcome reports whether one anime's outcome folds into the collapsed summary row
// instead of claiming a row of its own.
func isUneventfulOutcome(outcome animeRunOutcome) bool {
	return !outcome.failed && len(outcome.manualLinks) == 0 && outcome.episodesDownloaded == 0
}

// outcomeRowStatus reports one anime outcome's row status word.
//
// The order is a precedence, not a sequence of independent checks: an anime can download two
// episodes and then lose the third on every hoster, and the row carries ONE word. It has to be
// the one that needs a human, so failure outranks the manual link, which outranks the success.
func outcomeRowStatus(outcome animeRunOutcome) string {
	switch {
	case outcome.failed:
		return "failed"
	case len(outcome.manualLinks) > 0:
		return "manual"
	default:
		return "downloaded"
	}
}

// outcomeRowDetail reports one anime outcome's row detail line -- the specific "which episodes,
// which blocker" sentence the old run-wide body could never carry.
func outcomeRowDetail(outcome animeRunOutcome) string {
	switch {
	case outcome.failed:
		if outcome.episodesFailed > 0 {
			return fmt.Sprintf("%d episode(s) failed (%s)", outcome.episodesFailed, outcome.failureKind)
		}
		return fmt.Sprintf("failed to check for new episodes (%s)", outcome.failureKind)
	case len(outcome.manualLinks) > 0:
		return summarizeManualLinks(outcome.manualLinks, manualLinksSummaryLimit)
	default:
		return fmt.Sprintf("%s -- ready to watch", downloadedEpisodesPhrase(outcome))
	}
}

// downloadedEpisodesPhrase names the episodes an anime actually got, as a range when the
// recorded first/last provably describe one and as a plain count when they do not.
//
// The count check is what keeps the range honest: the download cursor is re-derived from the
// folder after every success, so first=4 last=12 with two episodes downloaded is a real
// possibility, and "Episodes 4-12" would claim nine episodes that never landed. Stating the
// count is worse copy and true, which beats better copy that is not.
func downloadedEpisodesPhrase(outcome animeRunOutcome) string {
	contiguous := outcome.firstEpisodeDownloaded > 0 &&
		outcome.lastEpisodeDownloaded-outcome.firstEpisodeDownloaded+1 == outcome.episodesDownloaded
	switch {
	case contiguous && outcome.episodesDownloaded == 1:
		return fmt.Sprintf("Episode %d", outcome.firstEpisodeDownloaded)
	case contiguous:
		return fmt.Sprintf("Episodes %d-%d", outcome.firstEpisodeDownloaded, outcome.lastEpisodeDownloaded)
	default:
		return fmt.Sprintf("%d episode(s) downloaded", outcome.episodesDownloaded)
	}
}
