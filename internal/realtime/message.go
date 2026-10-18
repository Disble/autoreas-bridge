package realtime

import "encoding/json"

const (
	// MessageTypeSyncRequired instructs a client to run a reconcile call.
	MessageTypeSyncRequired = "sync_required"
	// MessageTypeAnimeChanged carries an updated anime payload.
	MessageTypeAnimeChanged = "anime_changed"
	// MessageTypeAnimeCreated carries a newly created anime identifier.
	MessageTypeAnimeCreated = "anime_created"
	// MessageTypeAnimeDeleted carries a deleted anime identifier.
	MessageTypeAnimeDeleted = "anime_deleted"

	// SyncReasonConnectionGapAssumed explains why a sync is required on connect.
	SyncReasonConnectionGapAssumed = "connection_gap_assumed"
)

// ControlMessage is a generic control frame sent to websocket clients.
type ControlMessage struct {
	Type   string `json:"type"`
	Reason string `json:"reason,omitempty"`
}

// AnimeChangedMessage carries an updated anime snapshot payload.
type AnimeChangedMessage struct {
	Type    string          `json:"type"`
	AnimeID string          `json:"anime_id"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// AnimeIDMessage carries an anime identifier for create/delete notifications.
type AnimeIDMessage struct {
	Type    string `json:"type"`
	AnimeID string `json:"anime_id"`
}
