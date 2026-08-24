package download

import (
	"fmt"

	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
)

const (
	// downloadsRoute is the frontend route a run notification's whole-notification action opens.
	// It is frozen into the action's args at creation and resolved only at press time, so a run
	// notification from days ago still opens the right screen (design-canvas Intents.dc.html).
	downloadsRoute = "/downloads"
	// openDownloadsActionLabel is the copy the design canvas gives that whole-notification action.
	openDownloadsActionLabel = "Open Downloads"
	// runAnimeActionLabel is the copy the design canvas gives a row's own re-run action.
	runAnimeActionLabel = "Run this anime again"
	// animeRefType marks a detail row that references one anime, and is therefore the only kind
	// of row a download.run_anime token can be bound to.
	animeRefType = "anime"
	// copyHosterActionLabelFormat is the copy the design canvas gives a jd_offline row's own
	// actions: "Copy hoster 1", "Copy hoster 2". The number is the link's position within its
	// row, 1-based.
	copyHosterActionLabelFormat = "Copy hoster %d"
	// copyHosterActionsPerRowLimit caps how many copy tokens one row may carry. An anime
	// blocked across a whole season can accumulate dozens of links, and the canvas is explicit
	// that a notification listing everything is a log, not a notification. Same bound as
	// manualLinksSummaryLimit, which caps the body sentence for the same reason.
	copyHosterActionsPerRowLimit = 5
)

// runWideActions returns the action tokens every download-run notification carries about itself
// rather than about one of its rows. Today that is exactly one: "Open Downloads".
//
// Kept as a function rather than a package-level slice because an ActionSpec carries a mutable
// Args map -- a shared literal would let one notification's frozen arguments be rewritten
// through another's, which is precisely the immutability the token pattern exists to provide.
func runWideActions() []notification.ActionSpec {
	return []notification.ActionSpec{{
		Label:  openDownloadsActionLabel,
		Intent: center.IntentNavigationOpen,
		Args:   map[string]string{center.ArgKeyRoute: downloadsRoute},
	}}
}

// buildRunActions returns the full action set for a run notification carrying rows: the
// whole-notification tokens, plus one "Run this anime again" token bound to every row that
// names a single anime.
//
// A collapsed summary row is deliberately skipped: it stands in for anime it does not name, so
// there is no single target a re-run token could freeze. So is any row referencing something
// other than an anime, because download.run_anime resolves its target through GetAnimeDetail.
func buildRunActions(rows []notification.DetailItem) []notification.ActionSpec {
	actions := runWideActions()
	for _, row := range rows {
		if row.RefType != animeRefType || row.RefID == "" {
			continue
		}
		actions = append(actions, notification.ActionSpec{
			Label:  runAnimeActionLabel,
			Intent: center.IntentDownloadRunAnime,
			Args:   map[string]string{center.ArgKeyAnimeID: row.RefID},
			RowRef: row.RefID,
		})
	}
	return actions
}

// ============================================================================
// UNWIRED SEAM -- buildJDOfflineActions has NO production caller yet.
//
// The two jd_offline notification call sites still pass runWideActions():
//
//   internal/download/service.go        -> Service.setRunCompletionStatus,
//                                          the gate.knownOffline() branch
//   internal/download/service_single_anime.go
//                                       -> the single-anime jd_offline branch
//
// Both must be changed to pass buildJDOfflineActions(outcomes) instead, and
// the "Rows without the default per-row re-run token" comment above the first
// one deleted -- it explains an absence that will no longer exist. Until that
// happens, a jdownloader_offline row still renders with no copy-hoster button
// even though the intent behind it is registered and working
// (clipboard.copy, app_notification_center.go).
//
// Those two files were being refactored concurrently when this landed, so the
// edit was deliberately left out rather than made against a signature that was
// about to change. This block is the handoff.
// ============================================================================

// buildJDOfflineActions returns the action set for a jd_offline notification: the
// whole-notification tokens, plus one "Copy hoster N" token per hoster link on the row of the
// anime that link belongs to.
//
// It exists because the default per-row action is wrong here. buildRunActions binds "Run this
// anime again" to every named anime row, but re-running an anime whose downloader is still
// offline only reproduces the same block -- what the user actually needs is the link, to hand to
// JDownloader themselves. That is exactly what the design canvas draws on this row
// (Anatomy.dc.html: "Copy hoster 1", "Copy hoster 2"), and why this producer attaches rows
// WITHOUT the re-run token.
//
// Each link is frozen into its own Args map at creation. A link resolved at press time would be
// a different link: the run that found it is over, and hosters rotate their URLs.
func buildJDOfflineActions(outcomes []animeRunOutcome) []notification.ActionSpec {
	actions := runWideActions()
	for _, outcome := range outcomes {
		if outcome.animeID == "" {
			continue
		}
		actions = append(actions, copyHosterActions(outcome)...)
	}
	return actions
}

// copyHosterActions builds one copy token per hoster link of a single anime, numbered across
// every episode that contributed one -- the row is the anime, not the episode, so its buttons
// read 1..N in the order the run found them.
//
// An empty link is skipped rather than numbered: a token carrying no text refuses the moment it
// is pressed, and skipping it before numbering keeps the labels contiguous.
func copyHosterActions(outcome animeRunOutcome) []notification.ActionSpec {
	actions := make([]notification.ActionSpec, 0, copyHosterActionsPerRowLimit)
	for _, manual := range outcome.manualLinks {
		for _, link := range manual.Links {
			if link == "" {
				continue
			}
			if len(actions) == copyHosterActionsPerRowLimit {
				return actions
			}
			actions = append(actions, notification.ActionSpec{
				Label:  fmt.Sprintf(copyHosterActionLabelFormat, len(actions)+1),
				Intent: center.IntentClipboardCopy,
				Args:   map[string]string{center.ArgKeyText: link},
				RowRef: outcome.animeID,
			})
		}
	}
	return actions
}
