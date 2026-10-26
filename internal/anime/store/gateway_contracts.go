package store

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

// ErrWriteBaseChanged reports that the stored snapshot changed under a save.
var ErrWriteBaseChanged = errors.New("anime write base changed")

// Snapshot is the gateway-local persisted effective snapshot envelope.
type Snapshot struct {
	AnimeID       string
	CanonicalJSON []byte
	Hash          string
	ModifiedAt    int64
}

// Record is the English read contract crossing the legacy adapter boundary.
// The lossless wire envelope stays private to the gateway implementation.
type Record struct {
	Snapshot Snapshot
	Anime    domain.Anime
}

// AnimePatchOutcome reports the semantic result of a gateway mutation request.
type AnimePatchOutcome string

const (
	// AnimePatchOutcomeApplied means the requested mutation changed state.
	AnimePatchOutcomeApplied AnimePatchOutcome = "applied"
	// AnimePatchOutcomeNoOp means the request matched the existing durable state.
	AnimePatchOutcomeNoOp AnimePatchOutcome = "no_op"
	// AnimePatchOutcomeConflict means optimistic concurrency rejected the request.
	AnimePatchOutcomeConflict AnimePatchOutcome = "conflict"
)

// AnimePatchResult returns the semantic outcome of one gateway write request.
type AnimePatchResult struct {
	AnimeID    string
	Outcome    AnimePatchOutcome
	ModifiedAt int64
	ConflictID string
}

// UpdateCommand mutates one decoded domain anime before writeback. Mutate
// receives whether the gateway synthesized a missing record for this write, so
// a mutation can distinguish a genuine transition from a first observation of
// an anime that had no local state yet.
type UpdateCommand struct {
	AnimeID         string
	Base            *int64
	CreateIfMissing bool
	Mutate          func(*domain.Anime, bool)
}

// UpdateRawCommand mutates one decoded legacy wire record before writeback.
type UpdateRawCommand struct {
	AnimeID         string
	Base            *int64
	CreateIfMissing bool
	Mutate          func(*AnimeRaw, *domain.Anime) error
}

// ConflictWriter persists OCC conflicts detected by the gateway.
type ConflictWriter interface {
	InsertConflict(context.Context, contracts.ConflictRecord) error
}

// GatewayConfig wires the persistence seams required by the store gateway.
// Every write goes through Saves, one transaction per save.
type GatewayConfig struct {
	LoadSnapshot  func(context.Context, string) (Snapshot, error)
	ListSnapshots func(context.Context) (map[string]Snapshot, error)
	Saves         SaveStore
	// Rule rewrites every applied snapshot inside its save transaction.
	Rule           SaveRule
	Conflicts      ConflictWriter
	PublishChanged func(event CommittedChange)
	Now            func() time.Time
	NewEventID     func() string
}
