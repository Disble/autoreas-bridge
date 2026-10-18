package events

// EventNameSeasonProjectionChanged identifies the signal that season data an anime's season
// projection is read from may have changed.
const EventNameSeasonProjectionChanged = "season.projection_changed"

// SeasonProjectionChangedEvent is published after every season write. It carries no payload on
// purpose: it is a signal, not a delta. The sync context re-reads the projection and diffs it
// against what it last published, so a lost, repeated or coalesced signal can never leave a phone
// with a wrong candidacy.
type SeasonProjectionChangedEvent struct{}

// Name returns the bus event name for SeasonProjectionChangedEvent.
func (e SeasonProjectionChangedEvent) Name() string {
	return EventNameSeasonProjectionChanged
}
