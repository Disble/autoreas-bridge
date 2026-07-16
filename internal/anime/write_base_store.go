package anime

import "autoreas-bridge/internal/anime/legacy"

var (
	ErrWriteOperationNotFound          = legacy.ErrWriteOperationNotFound
	ErrWriteOperationNotStaged         = legacy.ErrWriteOperationNotStaged
	ErrWriteOperationSuperseded        = legacy.ErrWriteOperationSuperseded
	ErrWriteBaseNotFound               = legacy.ErrWriteBaseNotFound
	ErrWriteReservationBusy            = legacy.ErrWriteReservationBusy
	ErrWriteBaseChanged                = legacy.ErrWriteBaseChanged
	ErrAnimeChangedOutboxEventNotFound = legacy.ErrAnimeChangedOutboxEventNotFound
)

type WriteOperationStatus = legacy.WriteOperationStatus

const (
	WriteOperationStatusStaged     = legacy.WriteOperationStatusStaged
	WriteOperationStatusCommitted  = legacy.WriteOperationStatusCommitted
	WriteOperationStatusAborted    = legacy.WriteOperationStatusAborted
	WriteOperationStatusSuperseded = legacy.WriteOperationStatusSuperseded
)

type WriteRecoveryAction = legacy.WriteRecoveryAction

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

type BatchReplacementPhase = legacy.BatchReplacementPhase

const (
	BatchReplacementPhaseStaged      = legacy.BatchReplacementPhaseStaged
	BatchReplacementPhaseTempDurable = legacy.BatchReplacementPhaseTempDurable
	BatchReplacementPhaseBackupMoved = legacy.BatchReplacementPhaseBackupMoved
	BatchReplacementPhasePromoted    = legacy.BatchReplacementPhasePromoted
	BatchReplacementPhaseFinalized   = legacy.BatchReplacementPhaseFinalized
)

type BatchReplacementJournal = legacy.BatchReplacementJournal

type AnimeChangedOutboxEvent = legacy.AnimeChangedOutboxEvent

type AnimeChangedOutboxStore = legacy.AnimeChangedOutboxStore
