package download

import (
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
