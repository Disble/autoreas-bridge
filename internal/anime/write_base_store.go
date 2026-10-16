package anime

import (
	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/events"
)

// Write-base store errors are re-exported from the legacy adapter for package
// callers that work through the anime boundary.
var (
	ErrWriteOperationNotFound          = store.ErrWriteOperationNotFound
	ErrWriteOperationNotStaged         = store.ErrWriteOperationNotStaged
	ErrWriteOperationSuperseded        = store.ErrWriteOperationSuperseded
	ErrWriteBaseNotFound               = store.ErrWriteBaseNotFound
	ErrWriteReservationBusy            = store.ErrWriteReservationBusy
	ErrWriteBaseChanged                = store.ErrWriteBaseChanged
	ErrAnimeChangedOutboxEventNotFound = store.ErrAnimeChangedOutboxEventNotFound
)

// WriteOperationStatus tracks the lifecycle state of one staged write.
type WriteOperationStatus = store.WriteOperationStatus

// Write operation statuses are re-exported from the legacy adapter.
const (
	WriteOperationStatusStaged     = store.WriteOperationStatusStaged
	WriteOperationStatusCommitted  = store.WriteOperationStatusCommitted
	WriteOperationStatusAborted    = store.WriteOperationStatusAborted
	WriteOperationStatusSuperseded = store.WriteOperationStatusSuperseded
)

// WriteRecoveryAction describes how recovery resolved a staged write.
type WriteRecoveryAction = store.WriteRecoveryAction

// Write recovery actions are re-exported from the legacy adapter.
const (
	WriteRecoveryActionFinalized   = store.WriteRecoveryActionFinalized
	WriteRecoveryActionRetryAppend = store.WriteRecoveryActionRetryAppend
	WriteRecoveryActionDivergent   = store.WriteRecoveryActionDivergent
)

// WriteOperation is the durable evidence staged before a canonical Legacy
// append. The raw JSON values are complete lossless envelopes, not sparse
// domain projections.
type WriteOperation = store.WriteOperation

// WriteBase is the pre-write state retained for the token produced by a
// committed operation.
type WriteBase = store.WriteBase

// WriteBaseStore is the domain-facing persistence port for staging writes and
// retaining their pre-write bases. Recovery classifies hashes only; it never
// merges or chooses fields.
type WriteBaseStore = store.WriteBaseStore

// ChangedOutboxEvent stores one deferred anime.changed publication.
type ChangedOutboxEvent = store.AnimeChangedOutboxEvent

// newAnimeChangedEvent builds the bus event for one drained outbox row. It is
// the single place a committed write becomes an anime.changed event, so the
// derived change type and changed fields travel together to every subscriber.
func newAnimeChangedEvent(event ChangedOutboxEvent) events.AnimeChangedEvent {
	return events.AnimeChangedEvent{
		EventID:       event.EventID,
		AnimeID:       event.AnimeID,
		Payload:       append([]byte(nil), event.Payload...),
		ChangeType:    event.ChangeType,
		ChangedFields: append([]string(nil), event.ChangedFields...),
	}
}

// ChangedOutboxStore persists deferred anime.changed publications.
type ChangedOutboxStore = store.AnimeChangedOutboxStore
