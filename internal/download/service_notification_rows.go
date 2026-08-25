package download

import (
	"autoreas-bridge/internal/api/contracts"
	"fmt"

	"autoreas-bridge/internal/notification"
)

// runDetailRowsLimit caps how many anime one run notification names individually.
//
// Fifty, not the five that bounds manualLinksSummaryLimit, copyHosterActionsPerRowLimit and
// readinessAttentionRowsLimit. Those five bound a SENTENCE or a strip of buttons, where every
// extra entry costs the reader attention on a surface they did not ask to read. This bounds a
// persisted blob nobody pays for until they open the record and expand the group, so the only
// cost worth bounding is storage: fifty rows is roughly 6 KB of JSON, and the center keeps 2000
// records (defaultRowCap in internal/notification/center/sqlite_store.go), which puts the
// pathological ceiling in the low tens of megabytes. A real scheduled run checks one weekday's
// anime, an order of magnitude below the cut.
//
// Cutting lower would recreate the very defect this file exists to remove: an anime past the cut
// is destroyed exactly the way every uneventful anime used to be. So the cut sits where no real
// run reaches it, the anime that need attention are named before the quiet ones, and whatever
// still does not fit is COUNTED in the summary row rather than silently dropped.
const runDetailRowsLimit = 50

// buildRunDetailRows builds one notification.DetailItem per anime the run touched -- including
// every anime that finished without incident.
//
// It used to throw those away. An uneventful anime was counted into a trailing "N other anime
// finished without incident -- show all in Downloads" line and its id and name never reached the
// record. That line was false twice over: nothing persists a per-anime breakdown of a run
// (download.Run in store.go keeps only AnimesChecked/EpisodesFound/EpisodesDownloaded/
// EpisodesFailed/SkippedCount/UpToDateCount), so the Downloads screen had nothing to show; and
// the collapse was not DEFERRING the detail to that screen, it was destroying it at write time.
//
// The layout is: every anime worth acting on, then ONE summary row, then the quiet group that
// row heads. See runDetailSummaryRow for what the summary row now means.
func buildRunDetailRows(outcomes []animeRunOutcome) []notification.DetailItem {
	eventful, quiet := partitionRunOutcomes(outcomes)
	namedEventful, namedQuiet, unlisted := allocateRunDetailRows(eventful, quiet)

	rows := make([]notification.DetailItem, 0, len(namedEventful)+len(namedQuiet)+1)
	for _, outcome := range namedEventful {
		rows = append(rows, outcomeRow(outcome))
	}
	if len(namedQuiet)+unlisted > 0 {
		rows = append(rows, runDetailSummaryRow(len(namedQuiet), unlisted))
	}
	for _, outcome := range namedQuiet {
		rows = append(rows, outcomeRow(outcome))
	}
	if len(rows) == 0 {
		return nil
	}
	return rows
}

// runStartedRowStatus is the status word a row carries before the run has processed it.
//
// It is deliberately outside the vocabulary outcomeRowStatus writes. "downloaded", "failed",
// "manual", "up to date", "checked" and "skipped" each claim something that HAS happened, and a
// run that has only just begun has done none of them -- borrowing one would be how a detail pane
// starts lying quietly.
const runStartedRowStatus = "queued"

// buildRunStartedRows names the anime a run is about to process, so "Download run started" has a
// subject instead of being a sentence about nothing.
//
// It cannot reuse buildRunDetailRows: that one reads animeRunOutcome, and at this point no anime
// has an outcome. There is nothing to partition into eventful and quiet either, because nothing
// has happened yet -- so every addressable anime is named in selection order, and the overflow
// collapses into the same summary row a finished run uses, under the same 50-row bound.
//
// An anime with no id is skipped: the pane addresses a row by its RefID to resolve its cover, so a
// row that names no record renders as art that never arrives.
func buildRunStartedRows(animes []contracts.MobileAnime) []notification.DetailItem {
	addressable := make([]contracts.MobileAnime, 0, len(animes))
	for _, anime := range animes {
		if anime.ID != "" {
			addressable = append(addressable, anime)
		}
	}
	if len(addressable) == 0 {
		return nil
	}

	named := addressable[:min(len(addressable), runDetailRowsLimit)]
	rows := make([]notification.DetailItem, 0, len(named)+1)
	for _, anime := range named {
		rows = append(rows, notification.DetailItem{
			RefType: animeRefType,
			RefID:   anime.ID,
			Name:    anime.Name,
			Status:  runStartedRowStatus,
			Detail:  "waiting for this run to reach it",
		})
	}
	if unlisted := len(addressable) - len(named); unlisted > 0 {
		rows = append(rows, runDetailSummaryRow(0, unlisted))
	}
	return rows
}

// partitionRunOutcomes splits a run's outcomes into the anime worth acting on and the quiet ones,
// each in the order the run collected them.
func partitionRunOutcomes(outcomes []animeRunOutcome) (eventful, quiet []animeRunOutcome) {
	eventful = make([]animeRunOutcome, 0, len(outcomes))
	quiet = make([]animeRunOutcome, 0, len(outcomes))
	for _, outcome := range outcomes {
		if isUneventfulOutcome(outcome) {
			quiet = append(quiet, outcome)
			continue
		}
		eventful = append(eventful, outcome)
	}
	return eventful, quiet
}

// allocateRunDetailRows spends runDetailRowsLimit on the anime that need attention first, gives
// what is left to the quiet ones, and reports how many anime the record therefore cannot carry.
//
// The order is the point: a row the user must act on is never dropped to make room for one that
// finished quietly. min rather than an `if len(x) > limit` branch for the same reason
// buildSeasonAvailableRows uses it -- at exactly the limit both arms of that branch produce the
// identical result, so no test can tell `>` from `>=` there. Clamping removes the boundary
// instead of guarding it.
func allocateRunDetailRows(eventful, quiet []animeRunOutcome) (namedEventful, namedQuiet []animeRunOutcome, unlisted int) {
	namedEventful = eventful[:min(len(eventful), runDetailRowsLimit)]
	namedQuiet = quiet[:min(len(quiet), runDetailRowsLimit-len(namedEventful))]
	unlisted = (len(eventful) - len(namedEventful)) + (len(quiet) - len(namedQuiet))
	return namedEventful, namedQuiet, unlisted
}

// runDetailSummaryRow builds the record's single summary row.
//
// # What the summary row means now
//
// It is no longer a tombstone for anime the producer deleted. It is a HEADING over a group that
// is present: `listed` quiet rows follow it immediately, and the frontend is free to render them
// folded behind this one line. CollapsedCount is how many anime the row stands for -- the rows
// under it PLUS the `unlisted` anime the record could not carry at all.
//
// Three properties the rest of the system depends on:
//
//   - It PRECEDES its group, and every row after it belongs to it. A frontend that has not
//     caught up renders a collapsedCount row as one dashed line and nothing else
//     (NotificationDetailRow.tsx), so trailing it would read as "and N MORE anime, elsewhere" --
//     the exact claim this change removes. Leading it reads as a heading over rows printed right
//     below, which is what it now is.
//   - CollapsedCount is never zero on an emitted row. Zero would render it as an ordinary
//     nameless row: a cover placeholder with no title. buildRunDetailRows therefore emits no
//     summary row at all when there is nothing quiet and nothing unlisted.
//   - countNotificationSubjects (app_notification_center_projection.go) reads "stands for, minus
//     the rows that follow it" to get the number of anime the record does NOT carry, so the
//     master-list badge counts a run's anime once each rather than twice.
//
// The sentence names the two disjoint numbers separately: how many quiet anime are listed under
// this heading, and how many anime are not in the record at all. A run that fits states only the
// first; one that cannot even list a single quiet anime states only the second.
func runDetailSummaryRow(listed, unlisted int) notification.DetailItem {
	detail := fmt.Sprintf("%d anime this run touched are not listed", unlisted)
	if listed > 0 {
		detail = fmt.Sprintf("%d anime finished without incident", listed)
		if unlisted > 0 {
			detail += fmt.Sprintf(" -- %d more this run touched are not listed", unlisted)
		}
	}
	return notification.DetailItem{
		Status:         "ok",
		Detail:         detail,
		CollapsedCount: listed + unlisted,
	}
}

// outcomeRow builds the detail row naming one anime.
func outcomeRow(outcome animeRunOutcome) notification.DetailItem {
	return notification.DetailItem{
		RefType: animeRefType,
		RefID:   outcome.animeID,
		Name:    outcome.animeName,
		Status:  outcomeRowStatus(outcome),
		Detail:  outcomeRowDetail(outcome),
	}
}

// isUneventfulOutcome reports whether one anime's outcome belongs under the quiet heading rather
// than above it.
//
// "Finished without incident" has to be TRUE of every row the heading speaks for, which is why
// episodesFound rules an anime out even when nothing failed: an anime that found three episodes
// and downloaded none of them -- exactly what a stopped run leaves behind -- had an incident.
// What is left is genuinely boring: checked with nothing new, already current, or skipped.
func isUneventfulOutcome(outcome animeRunOutcome) bool {
	return !outcome.failed && len(outcome.manualLinks) == 0 &&
		outcome.episodesDownloaded == 0 && outcome.episodesFound == 0
}

// outcomeRowStatus reports one anime outcome's row status word.
//
// The order is a precedence, not a sequence of independent checks: an anime can download two
// episodes and then lose the third on every hoster, and the row carries ONE word. It has to be
// the one that needs a human, so failure outranks the manual link, which outranks the success.
//
// Below those three sit the words a quiet anime gets. They are deliberately their own vocabulary:
// "failed", "manual" and "downloaded" each claim something that did not happen, and reusing one
// for an anime that simply had nothing to do is how a detail pane starts lying quietly.
// Lowercase like every other status this package writes -- casing is the frontend's to decide,
// for all of them or none.
func outcomeRowStatus(outcome animeRunOutcome) string {
	switch {
	case outcome.failed:
		return "failed"
	case len(outcome.manualLinks) > 0:
		return "manual"
	case outcome.episodesDownloaded > 0:
		return "downloaded"
	case outcome.skipped:
		return "skipped"
	case outcome.upToDate:
		return "up to date"
	default:
		return "checked"
	}
}

// outcomeRowDetail reports one anime outcome's row detail line -- the specific "which episodes,
// which blocker" sentence the old run-wide body could never carry.
//
// The quiet branches say what actually happened without borrowing the failure vocabulary. A
// skipped anime's row does not name its blocker: the outcome does not carry the SkipReason the
// decision produced, and readiness_attention already warns about exactly those anime by name
// before the run starts.
func outcomeRowDetail(outcome animeRunOutcome) string {
	switch {
	case outcome.failed:
		if outcome.episodesFailed > 0 {
			return fmt.Sprintf("%d episode(s) failed (%s)", outcome.episodesFailed, outcome.failureKind)
		}
		return fmt.Sprintf("failed to check for new episodes (%s)", outcome.failureKind)
	case len(outcome.manualLinks) > 0:
		return summarizeManualLinks(outcome.manualLinks, manualLinksSummaryLimit)
	case outcome.episodesDownloaded > 0:
		return fmt.Sprintf("%s -- ready to watch", downloadedEpisodesPhrase(outcome))
	case outcome.skipped:
		return "Skipped -- it was not ready to download on this run"
	case outcome.upToDate:
		return "Already has every episode that is out -- nothing new to download"
	case outcome.episodesFound > 0:
		return fmt.Sprintf("%d new episode(s) found, none downloaded", outcome.episodesFound)
	default:
		return "Checked -- nothing new to download"
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
