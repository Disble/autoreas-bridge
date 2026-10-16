package anime

// CommittedPublisher announces one anime write the outbox drained. It is the
// only way an anime.changed event leaves the write path: every event it
// publishes was committed to SQLite first and carries the change type and
// changed fields the finalize transaction derived.
//
// It replaces the legacy queued update writer, which subscribed to
// anime.update_requested and published anime.changed for writes it never
// stored. Nothing in production requested such a write, so it could only ever
// announce a change that did not exist.
type CommittedPublisher interface {
	PublishCommitted(event ChangedOutboxEvent)
}

// busCommittedPublisher publishes drained outbox events on the event bus.
type busCommittedPublisher struct {
	publisher EventPublisher
}

// NewCommittedPublisher builds the production CommittedPublisher over an event
// publisher, normally the shared bus.
func NewCommittedPublisher(publisher EventPublisher) CommittedPublisher {
	return busCommittedPublisher{publisher: publisher}
}

// PublishCommitted publishes the anime.changed event for one drained outbox row.
func (p busCommittedPublisher) PublishCommitted(event ChangedOutboxEvent) {
	if p.publisher == nil {
		return
	}
	p.publisher.Publish(newAnimeChangedEvent(event))
}
