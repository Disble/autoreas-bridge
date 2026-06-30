package realtime

import "encoding/json"

const (
	MessageTypeSyncRequired       = "sync_required"
	MessageTypeAnimeChanged       = "anime_changed"
	MessageTypeAnimeCreated       = "anime_created"
	MessageTypeAnimeDeleted       = "anime_deleted"
	MessageTypePreferencesChanged = "preferences_changed"

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

type AnimeIDMessage struct {
	Type    string `json:"type"`
	AnimeID string `json:"anime_id"`
}

// PreferencesChangedMessage notifies connected mobile clients that a bridge-owned
// global preference changed. SeasonMode mirrors the contracts.StatusInfo field so
// the client can update its global season-mode state in realtime, exactly as it
// would on a cold GET /api/status read.
type PreferencesChangedMessage struct {
	Type       string `json:"type"`
	SeasonMode bool   `json:"season_mode"`
}
