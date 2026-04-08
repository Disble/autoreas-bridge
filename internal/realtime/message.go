package realtime

import "encoding/json"

const (
	MessageTypeSyncRequired = "sync_required"
	MessageTypeAnimeChanged = "anime_changed"

	SyncReasonConnectionGapAssumed = "connection_gap_assumed"
)

type ControlMessage struct {
	Type   string `json:"type"`
	Reason string `json:"reason,omitempty"`
}

type AnimeChangedMessage struct {
	Type    string          `json:"type"`
	AnimeID string          `json:"anime_id"`
	Payload json.RawMessage `json:"payload,omitempty"`
}
