package main

import (
	"fmt"

	"autoreas-bridge/internal/notification"
)

const (
	// seasonAvailableRefType marks a detail row that references an anime which is available
	// this season but is NOT in the catalog yet. Deliberately not "anime": there is no catalog
	// id behind it, so cover art cannot resolve and no anime-scoped action could freeze a
	// target. The name is the only reference such a row can honestly carry.
	seasonAvailableRefType = "season_anime"
	// seasonAvailableRowStatus is the status word an available-to-create row shows.
	seasonAvailableRowStatus = "new"
	// seasonAvailableRowDetail is the detail line every available-to-create row shows
	// (design-canvas Anatomy.dc.html).
	seasonAvailableRowDetail = "Available this season — not in your catalog yet"
)

// buildSeasonAvailableRows builds one detail row per newly available anime, bounded by the same
// seasonAvailableNamesShownInBody limit the body sentence uses -- one number, one meaning: how
// many anime this notification names individually. Everything past that limit folds into a
// single trailing summary row rather than growing the record without bound, exactly like a
// download run's uneventful anime do.
//
// An empty batch produces nil, so a Notification with nothing to individuate persists no
// rows_json at all (center's marshalRows nil-means-NULL contract).
func buildSeasonAvailableRows(names []string) []notification.DetailItem {
	if len(names) == 0 {
		return nil
	}
	named := names
	collapsed := 0
	if len(names) > seasonAvailableNamesShownInBody {
		named = names[:seasonAvailableNamesShownInBody]
		collapsed = len(names) - seasonAvailableNamesShownInBody
	}

	rows := make([]notification.DetailItem, 0, len(named)+1)
	for _, name := range named {
		rows = append(rows, notification.DetailItem{
			RefType: seasonAvailableRefType,
			RefID:   name,
			Name:    name,
			Status:  seasonAvailableRowStatus,
			Detail:  seasonAvailableRowDetail,
		})
	}
	if collapsed > 0 {
		rows = append(rows, notification.DetailItem{
			Status:         seasonAvailableRowStatus,
			Detail:         fmt.Sprintf("%d more available to create", collapsed),
			CollapsedCount: collapsed,
		})
	}
	return rows
}
