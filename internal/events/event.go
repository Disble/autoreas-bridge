package events

const (
	EventNameAnimeChanged         = "anime.changed"
	EventNameAnimeUpdateRequested = "anime.update_requested"
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
}

func (e AnimeChangedEvent) Name() string {
	return EventNameAnimeChanged
}

type AnimeUpdateRequestedEvent struct {
	AnimeID string
	Payload []byte
}

func (e AnimeUpdateRequestedEvent) Name() string {
	return EventNameAnimeUpdateRequested
}

type SyncRequestedEvent struct {
	Requester string
}

func (e SyncRequestedEvent) Name() string {
	return EventNameSyncRequested
}
