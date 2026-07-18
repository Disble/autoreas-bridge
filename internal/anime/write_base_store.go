package anime

import "autoreas-bridge/internal/anime/legacy"

// Write-base store errors are re-exported from the legacy adapter for package
// callers that work through the anime boundary.
var (
	ErrWriteOperationNotFound          = legacy.ErrWriteOperationNotFound
	ErrWriteOperationNotStaged         = legacy.ErrWriteOperationNotStaged
	ErrWriteOperationSuperseded        = legacy.ErrWriteOperationSuperseded
	ErrWriteBaseNotFound               = legacy.ErrWriteBaseNotFound
	ErrWriteReservationBusy            = legacy.ErrWriteReservationBusy
	ErrWriteBaseChanged                = legacy.ErrWriteBaseChanged
	ErrAnimeChangedOutboxEventNotFound = legacy.ErrAnimeChangedOutboxEventNotFound
)

// WriteOperationStatus tracks the lifecycle state of one staged write.
type WriteOperationStatus = legacy.WriteOperationStatus

// Write operation statuses are re-exported from the legacy adapter.
const (
	WriteOperationStatusStaged     = legacy.WriteOperationStatusStaged
	WriteOperationStatusCommitted  = legacy.WriteOperationStatusCommitted
	WriteOperationStatusAborted    = legacy.WriteOperationStatusAborted
	WriteOperationStatusSuperseded = legacy.WriteOperationStatusSuperseded
)

// WriteRecoveryAction describes how recovery resolved a staged write.
type WriteRecoveryAction = legacy.WriteRecoveryAction

// Write recovery actions are re-exported from the legacy adapter.
const (
	WriteRecoveryActionFinalized   = legacy.WriteRecoveryActionFinalized
	WriteRecoveryActionRetryAppend = legacy.WriteRecoveryActionRetryAppend
	WriteRecoveryActionDivergent   = legacy.WriteRecoveryActionDivergent
)

// WriteOperation is the durable evidence staged before a canonical Legacy
// append. The raw JSON values are complete lossless envelopes, not sparse
// domain projections.
type WriteOperation = legacy.WriteOperation

// WriteBase is the pre-write state retained for the token produced by a
// committed operation.
type WriteBase = legacy.WriteBase

// WriteBaseStore is the domain-facing persistence port for staging writes and
// retaining their pre-write bases. Recovery classifies hashes only; it never
// merges or chooses fields.
type WriteBaseStore = legacy.WriteBaseStore

// BatchReplacementPhase tracks the lifecycle of a full-file replacement.
type BatchReplacementPhase = legacy.BatchReplacementPhase

// Batch replacement phases are re-exported from the legacy adapter.
const (
	BatchReplacementPhaseStaged      = legacy.BatchReplacementPhaseStaged
	BatchReplacementPhaseTempDurable = legacy.BatchReplacementPhaseTempDurable
	BatchReplacementPhaseBackupMoved = legacy.BatchReplacementPhaseBackupMoved
	BatchReplacementPhasePromoted    = legacy.BatchReplacementPhasePromoted
	BatchReplacementPhaseFinalized   = legacy.BatchReplacementPhaseFinalized
)

// BatchReplacementJournal stores the durable checkpoints for one replacement batch.
type BatchReplacementJournal = legacy.BatchReplacementJournal

// ChangedOutboxEvent stores one deferred anime.changed publication.
type ChangedOutboxEvent = legacy.AnimeChangedOutboxEvent

// ChangedOutboxStore persists deferred anime.changed publications.
type ChangedOutboxStore = legacy.AnimeChangedOutboxStore
