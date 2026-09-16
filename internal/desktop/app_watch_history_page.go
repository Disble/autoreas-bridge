package desktop

import (
	"fmt"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/watchhistory"
)

// toWatchHistoryPageQuery maps a WatchHistoryPageRequest into the pure
// watchhistory.PageQuery the store pages on. An unrecognized Order returns a
// builder error rather than silently defaulting, so a typo on the wire never
// pages newest-first without the caller knowing (design.md D3). Kept out of
// app_runtime.go, which stayed at its own file-size budget without it.
func toWatchHistoryPageQuery(request contracts.WatchHistoryPageRequest) (watchhistory.PageQuery, error) {
	order, err := toWatchHistoryOrder(request.Order)
	if err != nil {
		return watchhistory.PageQuery{}, err
	}
	return watchhistory.PageQuery{
		Limit:    request.Limit,
		Cursor:   request.Cursor,
		Order:    order,
		Search:   request.Search,
		AnimeIDs: request.AnimeIDs,
		FromMS:   request.WatchedFromMS,
		ToMS:     request.WatchedToMS,
	}, nil
}

// toAnimeWatchHistoryPageQuery maps an AnimeWatchHistoryPageRequest into the
// pure watchhistory.PageQuery AnimePage scopes by cycle. It never fails: the
// per-anime request carries no Order field to validate (design.md D3).
func toAnimeWatchHistoryPageQuery(request contracts.AnimeWatchHistoryPageRequest) watchhistory.PageQuery {
	return watchhistory.PageQuery{Limit: request.Limit, Cursor: request.Cursor, Cycle: request.Cycle}
}

// toWatchHistoryOrder maps the wire Order string to watchhistory.Order.
// "" defaults to newest-first, mirroring WatchHistoryPageRequest.Order's
// documented zero value; any other unrecognized value is a builder error.
func toWatchHistoryOrder(order string) (watchhistory.Order, error) {
	switch order {
	case "", "newest":
		return watchhistory.OrderNewestFirst, nil
	case "oldest":
		return watchhistory.OrderOldestFirst, nil
	default:
		return 0, fmt.Errorf("unrecognized watch history order %q", order)
	}
}
