package download

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
)

// The readiness_attention notification: the only one of the fifteen the design canvas names that
// warns about something that has NOT happened yet. Every other kind reports a completed fact --
// a run finished, a device paired, a downloader went offline. This one says: these anime are
// scheduled to download, they cannot, and the scheduled run is about to skip them silently.
//
// Firing policy (user decision, notification-center design): it is raised on EVERY scheduled
// run, and on no manual one. It repeats until the anime is fixed, deliberately. There is no
// per-anime suppression, no cooldown and no dedupe window here -- predictability was chosen over
// silence, and a warning that only ever fires once is one the user has already scrolled past by
// the time they can act on it. A manual run is the user standing at the controls, so the same
// catalog state is not news.
const (
	// triggerScheduled is the RunOnce trigger the schedule.Scheduler passes
	// (internal/schedule/scheduler.go). The other one is "manual", from a Wails-triggered check.
	triggerScheduled = "scheduled"
	// readinessAttentionTitle is the copy the design canvas gives this notification's master-list
	// row (Main.dc.html, "Scheduled anime need attention").
	readinessAttentionTitle = "Scheduled anime need attention"
	// readinessAttentionRowStatus is the status word each named row carries.
	//
	// Lowercase, like every other status this package writes ("failed", "manual", "downloaded"):
	// the detail pane renders row.status verbatim, so a single capitalized producer would be the
	// only capitalized chip in an inbox of lowercase ones. The canvas draws "Blocked" the same
	// way it draws "Stopped" and "Downloaded" for rows the backend already writes lowercase --
	// casing is a presentation concern the frontend owns for all of them or none.
	readinessAttentionRowStatus = "blocked"
	// openInEditorActionLabel is the copy the design canvas gives a blocked row's own action
	// (Anatomy.dc.html).
	openInEditorActionLabel = "Open in editor"
	// editorRouteFormat builds the frontend route that opens one anime in the editor
	// (frontend/src/App.tsx, "/editor/:id"). It is frozen into the action's args at creation and
	// resolved only at press time, exactly like downloadsRoute.
	editorRouteFormat = "/editor/%s"
	// readinessAttentionRowsLimit caps how many blocked anime are named individually before the
	// rest fold into one summary row. Same bound as manualLinksSummaryLimit and
	// copyHosterActionsPerRowLimit, for the same reason the canvas gives: "a notification that
	// lists everything is a log, and we already have one of those".
	readinessAttentionRowsLimit = 5
)

// raiseReadinessAttention warns, before a scheduled run does any work, about the scheduled anime
// that run cannot download.
//
// It is called from RunOnce rather than from the completion ladder because the warning is about
// what is ABOUT to be skipped: raising it after the fact would put it above the run's own outcome
// in a newest-first inbox and read as a report on a run that had already finished ignoring them.
//
// Every way of learning nothing degrades to silence, never to a failed run: an unwired seam, a
// query error, and a catalog where nothing scheduled is blocked all return without notifying.
// This notice is an advisory attached to the run, so it must never be able to cost the run.
func (s *Service) raiseReadinessAttention(ctx context.Context, runID, trigger string) {
	if trigger != triggerScheduled || s.deps.Readiness == nil {
		return
	}
	snapshot, err := s.deps.Readiness(ctx)
	if err != nil {
		s.logf(logger.LevelWarn, runID, "", "download.readiness_unavailable", nil,
			"readiness snapshot for run %s unavailable, skipping the attention notice: %v", runID, err)
		return
	}
	blocked := scheduledBlockedAnimes(snapshot.Items)
	if len(blocked) == 0 {
		return
	}
	rows := buildReadinessAttentionRows(blocked)
	s.notifyWithRowsAndActions(ctx, notification.LevelWarning, kindReadinessAttention, runID,
		readinessAttentionTitle,
		fmt.Sprintf("%d scheduled anime cannot download and will be skipped on this run.", len(blocked)),
		rows, buildReadinessAttentionActions(runID, rows))
}

// scheduledBlockedAnimes narrows a readiness snapshot to the anime this notice is about: the ones
// today's schedule selects AND that cannot download.
//
// It re-derives the set from Items rather than reading snapshot.ScheduledBlocked, even though the
// two are built from the same loop, because the body sentence and the rows must agree by
// construction. A count read from one field while the rows come from another is a sentence that
// can outlive the list it describes.
func scheduledBlockedAnimes(items []contracts.AnimeDownloadReadiness) []contracts.AnimeDownloadReadiness {
	blocked := make([]contracts.AnimeDownloadReadiness, 0, len(items))
	for _, item := range items {
		if item.ScheduledToday && !item.Ready {
			blocked = append(blocked, item)
		}
	}
	return blocked
}

// buildReadinessAttentionRows builds one notification.DetailItem per blocked anime, up to
// readinessAttentionRowsLimit, and folds any remainder into a single trailing summary row.
//
// The bound works differently from buildRunDetailRows' even though the shape it emits is
// identical. There, an anime collapses because its outcome is boring; here every anime is blocked,
// so nothing is boring and the only honest reason to collapse is length. That is why the cut is
// positional rather than predicate-based -- and why the summary row still carries CollapsedCount,
// which is what makes the detail pane render it as the one dashed line instead of a row.
func buildReadinessAttentionRows(blocked []contracts.AnimeDownloadReadiness) []notification.DetailItem {
	named := blocked
	collapsedCount := 0
	if len(named) > readinessAttentionRowsLimit {
		collapsedCount = len(named) - readinessAttentionRowsLimit
		named = named[:readinessAttentionRowsLimit]
	}
	rows := make([]notification.DetailItem, 0, len(named)+1)
	for _, item := range named {
		rows = append(rows, notification.DetailItem{
			RefType: animeRefType,
			RefID:   item.AnimeID,
			Name:    item.Name,
			Status:  readinessAttentionRowStatus,
			Detail:  readinessBlockerSentence(item.Reasons),
		})
	}
	if collapsedCount > 0 {
		rows = append(rows, notification.DetailItem{
			Status:         readinessAttentionRowStatus,
			Detail:         fmt.Sprintf("%d more scheduled anime need attention", collapsedCount),
			CollapsedCount: collapsedCount,
		})
	}
	return rows
}

// buildReadinessAttentionActions binds one "Open in editor" token to every row that names a single
// anime, with that anime's editor route frozen into its own Args map.
//
// A retry would be wrong here for the same reason it is wrong on a hoster-blocked row: "Run this
// anime again" against an anime with no source only reproduces the skip. What the user needs is
// the screen where the missing field lives, which is exactly what the canvas draws on this row.
//
// These rows describe anime the run has not reached yet, so there is no animeRunOutcome to read
// the verb from -- which is why this producer builds its tokens itself rather than going through
// buildOutcomeActions. The verb it picks is the same one that builder gives a `skipped` row.
//
// The summary row is skipped, because it stands in for anime it does not name -- there is no
// single editor route a token could be frozen to. Each row gets its own Args map rather than a
// shared one, so one row's frozen route can never be rewritten through another's.
func buildReadinessAttentionActions(runID string, rows []notification.DetailItem) []notification.ActionSpec {
	actions := runWideActions(kindReadinessAttention, runID)
	for _, row := range rows {
		if row.RefType != animeRefType || row.RefID == "" {
			continue
		}
		actions = append(actions, notification.ActionSpec{
			Label:  openInEditorActionLabel,
			Intent: center.IntentNavigationOpen,
			Args:   map[string]string{center.ArgKeyRoute: fmt.Sprintf(editorRouteFormat, row.RefID)},
			RowRef: row.RefID,
		})
	}
	return actions
}

// readinessBlockerSentence turns one anime's readiness blockers into the row's detail line.
//
// Each reason gets its own sentence naming BOTH what is wrong and what fixes it. A single generic
// line for all four would open the editor without telling the user what to change there, which is
// the difference between a notification and a nag.
//
// Only the first reason is spoken. An anime can carry two (a source blocker and a destination
// one), but the row carries ONE line, and EvaluateAnimeForDownload already treats reasons[0] as
// the primary blocker when it picks the decision's SkipReason -- so this reads the same reason the
// run itself will act on rather than inventing a second precedence.
func readinessBlockerSentence(reasons []contracts.DownloadReadinessReason) string {
	if len(reasons) == 0 {
		return "Not ready to download -- it will be skipped on every scheduled run until you open it and fix it"
	}
	switch reasons[0] {
	case contracts.DownloadReadinessMissingSource:
		return "Missing source -- it will be skipped on every scheduled run until you set one"
	case contracts.DownloadReadinessInvalidSource:
		return "Source is not a valid web address -- it will be skipped on every scheduled run until you correct it"
	case contracts.DownloadReadinessUnsupportedSource:
		return "Source site has no download adapter -- it will be skipped on every scheduled run until you point it at a supported site"
	case contracts.DownloadReadinessDestinationUnresolved:
		return "No download folder resolves for it -- it will be skipped on every scheduled run until you set one"
	default:
		return "Not ready to download -- it will be skipped on every scheduled run until you open it and fix it"
	}
}
