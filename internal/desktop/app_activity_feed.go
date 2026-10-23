package desktop

import "autoreas-bridge/internal/observability/activityread"

// ActivityFeedQuery is one feed page request from the Activity screen. A zero
// FromMS or ToMS means the edge of the 90-day ledger span; no Types means
// every type.
type ActivityFeedQuery struct {
	FromMS       int64
	ToMS         int64
	Origin       string
	Types        []string
	FailuresOnly bool
	Cursor       string
	Limit        int
}

// SearchActivityFeed returns one page of the Activity feed for the query,
// read with the app clock.
func (a *App) SearchActivityFeed(query ActivityFeedQuery) (activityread.FeedView, error) {
	reader, err := a.activityReader()
	if err != nil {
		return activityread.FeedView{}, err
	}
	return reader.Feed(a.seasonCtx(), activityread.FeedInput{
		Now: a.currentTime(), FromMS: query.FromMS, ToMS: query.ToMS, Origin: activityread.FeedOrigin(query.Origin),
		Types: toFeedTypes(query.Types), FailuresOnly: query.FailuresOnly, Cursor: query.Cursor, Limit: query.Limit,
	})
}

// GetActivityOverview returns the time chart of one scale (24h, 7d, 30d, 90d)
// and the per-type counts of a range and origin, read with the app clock. A
// zero bound means the edge of the scale's window.
func (a *App) GetActivityOverview(scale string, fromMS, toMS int64, origin string) (activityread.OverviewView, error) {
	reader, err := a.activityReader()
	if err != nil {
		return activityread.OverviewView{}, err
	}
	return reader.Overview(a.seasonCtx(), activityread.OverviewInput{
		Now: a.currentTime(), Scale: activityread.ChartScale(scale), FromMS: fromMS, ToMS: toMS, Origin: activityread.FeedOrigin(origin),
	})
}

// toFeedTypes converts the wire type names; the reader rejects unknown ones.
func toFeedTypes(names []string) []activityread.FeedType {
	types := make([]activityread.FeedType, len(names))
	for i, name := range names {
		types[i] = activityread.FeedType(name)
	}
	return types
}

// GetActivityEvent returns one runtime event with its metadata, for the
// Activity drawer; Found is false when no event has that id.
func (a *App) GetActivityEvent(id int64) (activityread.EventDetail, error) {
	reader, err := a.activityReader()
	if err != nil {
		return activityread.EventDetail{}, err
	}
	return reader.Event(a.seasonCtx(), id)
}
