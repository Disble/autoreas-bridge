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
	// MessageTypePreferencesChanged carries changed bridge preferences.
	MessageTypePreferencesChanged = "preferences_changed"
	// MessageTypeSeasonChanged carries active-season updates.
	MessageTypeSeasonChanged = "season_changed"

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

// PreferencesChangedMessage notifies connected mobile clients that a bridge-owned
// global preference changed. SeasonMode mirrors the contracts.StatusInfo field so
// the client can update its global season-mode state in realtime, exactly as it
// would on a cold GET /api/status read.
type PreferencesChangedMessage struct {
	Type       string `json:"type"`
	SeasonMode bool   `json:"season_mode"`
}

// SeasonChangedMessage signals connected clients that the active season mutated
// (created, parameters changed, or closed). It carries a compact snapshot so a
// client can update without an immediate round-trip; SeasonID is empty and
// Status "closed"/"" when no season is open.
type SeasonChangedMessage struct {
	Type     string `json:"type"`
	SeasonID string `json:"season_id"`
	Status   string `json:"status"`
}
