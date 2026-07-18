package legacy

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
	StageBatchReplacement(context.Context, BatchReplacementJournal) error
	UpdateBatchReplacementPhase(context.Context, string, BatchReplacementPhase, int64) error
	GetBatchReplacement(context.Context, string) (BatchReplacementJournal, error)
}

// BatchReplacementPhase tracks the lifecycle phase of a full-file replacement.
type BatchReplacementPhase string

const (
	// BatchReplacementPhaseStaged marks the replacement journal as created.
	BatchReplacementPhaseStaged BatchReplacementPhase = "staged"
	// BatchReplacementPhaseTempDurable marks the temp file as durably written.
	BatchReplacementPhaseTempDurable BatchReplacementPhase = "temp_durable"
	// BatchReplacementPhaseBackupMoved marks the original file as backed up.
	BatchReplacementPhaseBackupMoved BatchReplacementPhase = "backup_moved"
	// BatchReplacementPhasePromoted marks the temp file as promoted into place.
	BatchReplacementPhasePromoted BatchReplacementPhase = "promoted"
	// BatchReplacementPhaseFinalized marks the replacement flow as fully finished.
	BatchReplacementPhaseFinalized BatchReplacementPhase = "finalized"
)

// BatchReplacementJournal stores the durable checkpoints for a replacement batch.
type BatchReplacementJournal struct {
	BatchID         string
	CanonicalPath   string
	TempPath        string
	BackupPath      string
	BaseFileHash    string
	DesiredFileHash string
	Phase           BatchReplacementPhase
	CreatedAtMs     int64
	UpdatedAtMs     int64
}

// ReplacementEchoRegistry suppresses watcher self-echo during full-file replacements.
type ReplacementEchoRegistry interface {
	Remember([]byte)
	Forget([]byte)
	BeginReplacement()
	EndReplacement()
	ReplacementInFlight() bool
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

// GatewayConfig wires the persistence seams required by the legacy gateway.
type GatewayConfig struct {
	LoadSnapshot      func(context.Context, string) (Snapshot, error)
	ListSnapshots     func(context.Context) (map[string]Snapshot, error)
	FilePath          string
	Operations        WriteBaseStore
	Outbox            AnimeChangedOutboxStore
	Conflicts         ConflictWriter
	Append            func(context.Context, string, []byte) error
	ReplaceFile       func(context.Context, string, [][]byte) error
	ReplaceCheckpoint func(BatchReplacementPhase) error
	ReplacementEcho   ReplacementEchoRegistry
	PublishChanged    func(string, string, []byte)
	Now               func() time.Time
	NewOperationID    func() string
}

// BatchReplaceFailureKind classifies how certain a replacement failure is.
type BatchReplaceFailureKind string

const (
	// BatchReplaceFailureDefinite means the replacement definitely failed before promotion.
	BatchReplaceFailureDefinite BatchReplaceFailureKind = "definite"
	// BatchReplaceFailureAmbiguous means recovery must inspect durable state before retrying.
	BatchReplaceFailureAmbiguous BatchReplaceFailureKind = "ambiguous"
)

// BatchReplaceError preserves certainty information for replacement failures.
type BatchReplaceError struct {
	Kind BatchReplaceFailureKind
	Err  error
}

func (e *BatchReplaceError) Error() string { return e.Err.Error() }
func (e *BatchReplaceError) Unwrap() error { return e.Err }

// NewDefiniteBatchReplaceError wraps an error known to be a definite replacement failure.
func NewDefiniteBatchReplaceError(err error) error {
	if err == nil {
		return nil
	}
	return &BatchReplaceError{Kind: BatchReplaceFailureDefinite, Err: err}
}

// NewAmbiguousBatchReplaceError wraps an error that requires durable-state inspection.
func NewAmbiguousBatchReplaceError(err error) error {
	if err == nil {
		return nil
	}
	return &BatchReplaceError{Kind: BatchReplaceFailureAmbiguous, Err: err}
}

// IsDefiniteBatchReplaceError reports whether err is a definite replacement failure.
func IsDefiniteBatchReplaceError(err error) bool {
	var target *BatchReplaceError
	return errors.As(err, &target) && target.Kind == BatchReplaceFailureDefinite
}
