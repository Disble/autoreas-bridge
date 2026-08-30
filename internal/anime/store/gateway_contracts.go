package store

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

var (
	// ErrWriteOperationNotFound reports a missing staged write operation.
	ErrWriteOperationNotFound = errors.New("write operation not found")
	// ErrWriteOperationNotStaged reports a write operation in an invalid lifecycle phase.
	ErrWriteOperationNotStaged = errors.New("write operation is not staged")
	// ErrWriteOperationSuperseded reports a staged write replaced by a newer batch.
	ErrWriteOperationSuperseded = errors.New("write operation was superseded")
	// ErrWriteBaseNotFound reports a missing stored write base.
	ErrWriteBaseNotFound = errors.New("write base not found")
	// ErrWriteReservationBusy reports an in-flight reservation for the same anime.
	ErrWriteReservationBusy = errors.New("anime write reservation is busy")
	// ErrWriteBaseChanged reports that the stored write base no longer matches reality.
	ErrWriteBaseChanged = errors.New("anime write base changed")
	// ErrAnimeChangedOutboxEventNotFound reports a missing anime.changed outbox row.
	ErrAnimeChangedOutboxEventNotFound = errors.New("anime.changed outbox event not found")
)

const (
	writeReservationRetryDelay = 5 * time.Millisecond
	writeCleanupTimeout        = 5 * time.Second
)

// WriteOperationStatus tracks the lifecycle state of one staged gateway write.
type WriteOperationStatus string

const (
	// WriteOperationStatusStaged marks a write reserved but not yet committed.
	WriteOperationStatusStaged WriteOperationStatus = "staged"
	// WriteOperationStatusCommitted marks a write that reached durable commit.
	WriteOperationStatusCommitted WriteOperationStatus = "committed"
	// WriteOperationStatusAborted marks a write that was intentionally rolled back.
	WriteOperationStatusAborted WriteOperationStatus = "aborted"
	// WriteOperationStatusSuperseded marks a write replaced by a newer batch.
	WriteOperationStatusSuperseded WriteOperationStatus = "superseded"
)

// WriteRecoveryAction describes how recovery resolved a staged write.
type WriteRecoveryAction string

const (
	// WriteRecoveryActionFinalized means recovery confirmed the original write committed.
	WriteRecoveryActionFinalized WriteRecoveryAction = "finalized"
	// WriteRecoveryActionRetryAppend means recovery must retry the append path.
	WriteRecoveryActionRetryAppend WriteRecoveryAction = "retry_append"
	// WriteRecoveryActionDivergent means the durable state no longer matches the staged intent.
	WriteRecoveryActionDivergent WriteRecoveryAction = "divergent"
)

// WriteOperation stores the staged metadata required to safely finalize one write.
type WriteOperation struct {
	OperationID         string
	AnimeID             string
	BatchID             string
	BatchOrder          int
	BatchSize           int
	BaseModifiedAt      int64
	IntendedModifiedAt  int64
	BaseSnapshotJSON    []byte
	BaseHash            string
	DesiredSnapshotJSON []byte
	DesiredHash         string
	Status              WriteOperationStatus
	CreatedAtMs         int64
	CommittedAtMs       *int64
}

// WriteBase captures the source snapshot used to validate optimistic writes.
type WriteBase struct {
	OperationID         string
	AnimeID             string
	BaseModifiedAt      int64
	ResultingModifiedAt int64
	SnapshotJSON        []byte
	SnapshotHash        string
}

// WriteBaseStore persists staged gateway writes and their recovery metadata.
// SDD-55 Slice B: the file-replacement journal (StageBatchReplacement /
// UpdateBatchReplacementPhase / GetBatchReplacement) was dropped from this
// port -- batch writes now finalize straight into SQLite (ApplyBatch in
// gateway.go), so there is no full-file replacement to checkpoint anymore.
type WriteBaseStore interface {
	Stage(context.Context, WriteOperation) error
	StageBatch(context.Context, []WriteOperation) error
	Finalize(context.Context, string, int64) error
	FinalizeBatch(context.Context, string, int64) error
	Abort(context.Context, string) error
	AbortBatch(context.Context, string) error
	ListStaged(context.Context) ([]WriteOperation, error)
	GetBase(context.Context, string, int64) (WriteBase, error)
	Recover(context.Context, string, string, int64) (WriteRecoveryAction, error)
	MarkBatchSuperseded(context.Context, string) error
}

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

// UpdateCommand mutates one decoded domain anime before writeback.
type UpdateCommand struct {
	AnimeID         string
	Base            *int64
	CreateIfMissing bool
	Mutate          func(*domain.Anime)
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
// SDD-55 Slice B: the Append/FilePath file-write port and the full-file
// replacement seams (ReplaceFile/ReplaceCheckpoint/ReplacementEcho) are gone
// -- persist() and ApplyBatch finalize straight into SQLite.
type GatewayConfig struct {
	LoadSnapshot   func(context.Context, string) (Snapshot, error)
	ListSnapshots  func(context.Context) (map[string]Snapshot, error)
	Operations     WriteBaseStore
	Outbox         AnimeChangedOutboxStore
	Conflicts      ConflictWriter
	PublishChanged func(eventID, animeID string, payload []byte, changedFields []string)
	Now            func() time.Time
	NewOperationID func() string
}
