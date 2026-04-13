package events

const (
	EventNameAnimeChanged         = "anime.changed"
	EventNameAnimeUpdateRequested = "anime.update_requested"
	EventNameAnimeWriteFailed     = "anime.write.failed"
	EventNameSyncRequested        = "sync.requested"

	AnimeChangeTypeCreate = "create"
	AnimeChangeTypeUpdate = "update"
	AnimeChangeTypeDelete = "delete"
)

type Event interface {
	Name() string
}

type AnimeChangedEvent struct {
	AnimeID       string
	Payload       []byte
	ChangeType    string
	ChangedFields []string
	CorrelationID string
}

func (e AnimeChangedEvent) Name() string {
	return EventNameAnimeChanged
}

type AnimeUpdateRequestedEvent struct {
	AnimeID       string
	Payload       []byte
	CorrelationID string
}

func (e AnimeUpdateRequestedEvent) Name() string {
	return EventNameAnimeUpdateRequested
}

type AnimeWriteFailedEvent struct {
	AnimeID       string
	Path          string
	Err           string
	CorrelationID string
}

func (e AnimeWriteFailedEvent) Name() string {
	return EventNameAnimeWriteFailed
}

func (e AnimeWriteFailedEvent) EventName() string {
	return EventNameAnimeWriteFailed
}

type SyncRequestedEvent struct {
	Requester     string
	CorrelationID string
}

func (e SyncRequestedEvent) Name() string {
	return EventNameSyncRequested
}
