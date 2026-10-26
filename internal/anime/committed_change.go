package anime

import (
	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/events"
)

// CommittedChange is one anime change a save committed, announced after the commit.
type CommittedChange = store.CommittedChange

// newAnimeChangedEvent builds the bus event for one committed write. It is
// the single place a committed write becomes an anime.changed event, so the
// derived change type and changed fields travel together to every subscriber.
// The event id becomes the correlation id, so an anime.changed log line joins
// the changelog row with that source event id.
func newAnimeChangedEvent(event CommittedChange) events.AnimeChangedEvent {
	return events.AnimeChangedEvent{
		EventID:       event.EventID,
		AnimeID:       event.AnimeID,
		Payload:       append([]byte(nil), event.Payload...),
		ChangeType:    event.ChangeType,
		ChangedFields: append([]string(nil), event.ChangedFields...),
		CorrelationID: event.EventID,
	}
}
