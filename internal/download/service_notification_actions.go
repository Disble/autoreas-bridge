package download

import (
	"fmt"

	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
)

const (
	// seeThisRunRouteFormat is the frontend route a run notification's whole-notification action
	// opens: the Downloads screen with THIS run selected. Frozen into the action's args at
	// creation and resolved only at press time, so a run notification from days ago still opens
	// the right screen and the right run.
	//
	// The run id is what the record already carries as its correlation id, which is the whole
	// reason that field stopped being printed in the notification pane as an opaque token: it is
	// an argument for a link, not for text (docs/notification-cta-policy.md).
	seeThisRunRouteFormat = "/downloads?runId=%s"
	// seeThisRunActionLabel is the copy on that action. It replaced a plain "Open Downloads",
	// which landed on the same screen showing whichever run happened to be newest.
	seeThisRunActionLabel = "See this run"
	// runAnimeActionLabel is the copy the design canvas gives a row's own re-run action.
	runAnimeActionLabel = "Run this anime again"
	// animeRefType marks a detail row that references one anime. Every row-bound token this
	// package mints addresses an anime, so it is the only RefType any of them carries.
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
	// watchActionLabel is the copy a row whose episodes are already on disk offers. Bridge has
	// no player, so "watch" means "take me to where this anime is", not "play it".
	watchActionLabel = "Watch"
	// watchRouteFormat is the anime-scoped destination a downloaded row freezes. It is the
	// anime's own screen rather than the day view: the row is about ONE anime, and /today is
	// scoped to a day that may not be the one this anime is scheduled on
	// (docs/notification-cta-policy.md, "L2 never navigates to a generic context").
	watchRouteFormat = "/catalog/detail/%s"
	// watchTodayActionLabel is the copy a completed run's whole-notification action offers, and
	// todayRoute is where it points. This is the run-scoped half of the same argument the per-row
	// verbs settle: the body says how many episodes landed, so the event's own destination is the
	// day view where they are watched.
	watchTodayActionLabel = "Watch today"
	todayRoute            = "/today"
)

// runWideActions returns the action tokens a download-run notification carries about ITSELF
// rather than about one of its rows. Every run notification is about the run, so all of them
// carry "Open Downloads"; a completed one also offers where to go watch what it landed.
//
// This is the one place a notification's KIND decides a verb, and that is the level split doing
// its job: L1 answers "where does this event live", which is a property of the event. The rows
// underneath ask a different question and answer it from their own outcomes.
//
// Kept as a function rather than a package-level slice because an ActionSpec carries a mutable
// Args map -- a shared literal would let one notification's frozen arguments be rewritten
// through another's, which is precisely the immutability the token pattern exists to provide.
func runWideActions(kind string, runID string) []notification.ActionSpec {
	actions := []notification.ActionSpec{{
		Label:  seeThisRunActionLabel,
		Intent: center.IntentNavigationOpen,
		Args:   map[string]string{center.ArgKeyRoute: fmt.Sprintf(seeThisRunRouteFormat, runID)},
	}}
	if kind == kindRunCompleted {
		actions = append(actions, notification.ActionSpec{
			Label:  watchTodayActionLabel,
			Intent: center.IntentNavigationOpen,
			Args:   map[string]string{center.ArgKeyRoute: todayRoute},
		})
	}
	return actions
}

// buildOutcomeActions returns the full action set for a run notification: the whole-notification
// tokens, plus the ONE verb each named anime's own outcome calls for.
//
// The verb is chosen from the OUTCOME, never from the notification's kind, because one run holds
// rows that each want a different one -- a run can fail on one anime, download another, and find a
// third already current. Keying on the kind bound "Run this anime again" to all three at once: it
// invited the user to re-download finished work, offered a retry instead of the link to an anime
// whose downloader was still offline, and left a failed row inside a jd_offline notification with
// no verb at all. See docs/notification-cta-policy.md, Table B.
//
// An outcome with no id is skipped outright: every verb below addresses a record, so a token
// frozen against no id would refuse the moment it was pressed.
func buildOutcomeActions(kind string, runID string, outcomes []animeRunOutcome) []notification.ActionSpec {
	actions := runWideActions(kind, runID)
	for _, outcome := range outcomes {
		if outcome.animeID == "" {
			continue
		}
		actions = append(actions, outcomeRowActions(outcome)...)
	}
	return actions
}

// outcomeRowActions returns the tokens one anime row offers, chosen by what actually happened to
// that anime.
//
// The order is a precedence, not a sequence of independent checks, and it is deliberately the same
// one outcomeRowStatus applies to the row's status word: an anime can download two episodes and
// then lose the third on every hoster, and the row carries ONE verb, so it has to be the one that
// needs a human. Failure outranks the manual link, which outranks the success.
//
// A quiet outcome returns nothing. An anime that was already current has no next step, and a button
// that means nothing is worse than no button -- it teaches the user that the buttons are noise.
func outcomeRowActions(outcome animeRunOutcome) []notification.ActionSpec {
	switch {
	case outcome.failed:
		return []notification.ActionSpec{{
			Label:  runAnimeActionLabel,
			Intent: center.IntentDownloadRunAnime,
			Args:   map[string]string{center.ArgKeyAnimeID: outcome.animeID},
			RowRef: outcome.animeID,
		}}
	case len(outcome.manualLinks) > 0:
		return copyHosterActions(outcome)
	case outcome.episodesDownloaded > 0:
		return []notification.ActionSpec{{
			Label:  watchActionLabel,
			Intent: center.IntentNavigationOpen,
			Args:   map[string]string{center.ArgKeyRoute: fmt.Sprintf(watchRouteFormat, outcome.animeID)},
			RowRef: outcome.animeID,
		}}
	case outcome.skipped:
		return []notification.ActionSpec{{
			Label:  openInEditorActionLabel,
			Intent: center.IntentNavigationOpen,
			Args:   map[string]string{center.ArgKeyRoute: fmt.Sprintf(editorRouteFormat, outcome.animeID)},
			RowRef: outcome.animeID,
		}}
	default:
		return nil
	}
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
