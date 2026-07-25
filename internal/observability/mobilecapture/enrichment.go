package mobilecapture

import (
	"context"

	"autoreas-bridge/internal/device"
)

// captureEnrichmentKey is the private context key used to install and
// retrieve the request-scoped CaptureEnrichment holder.
type captureEnrichmentKey struct{}

// CaptureEnrichment carries the semantic facts a handler contributes for a
// single request/message: outcome, error code, anime id, payload, and
// correlation IDs. The capture middleware/decorator reads it after the
// handler returns and merges it onto the transport-derived capture record.
type CaptureEnrichment struct {
	device       DeviceIdentity
	outcome      string
	errorCode    string
	animeID      *string
	payload      map[string]any
	correlations Correlations
	set          bool
}

// newEnrichmentHolder builds a fresh, empty CaptureEnrichment holder.
func newEnrichmentHolder() *CaptureEnrichment {
	return &CaptureEnrichment{correlations: Correlations{OperationRefs: []OperationRef{}}}
}

// NewEnrichmentContext installs a fresh CaptureEnrichment holder on ctx and
// returns both the derived context (for the request/message being handled)
// and the holder handlers should mutate via Enrich(ctx) or the returned
// pointer directly.
func NewEnrichmentContext(ctx context.Context) (context.Context, *CaptureEnrichment) {
	enr := newEnrichmentHolder()
	return context.WithValue(ctx, captureEnrichmentKey{}, enr), enr
}

// Enrich returns the CaptureEnrichment holder installed on ctx by
// NewEnrichmentContext. When no holder was installed (a handler invoked
// outside the capture middleware, e.g. in unit tests), it returns a safe
// no-op holder so callers never need a nil check.
func Enrich(ctx context.Context) *CaptureEnrichment {
	if enr, ok := ctx.Value(captureEnrichmentKey{}).(*CaptureEnrichment); ok && enr != nil {
		return enr
	}
	return newEnrichmentHolder()
}

// SetOutcome records the semantic outcome of the request (e.g. "accepted").
func (e *CaptureEnrichment) SetOutcome(outcome string) *CaptureEnrichment {
	e.outcome = outcome
	e.set = true
	return e
}

// SetDevice records the trusted authenticated device identity.
func (e *CaptureEnrichment) SetDevice(pairedDevice device.PairedDevice) *CaptureEnrichment {
	e.device = DeviceIdentity{DeviceID: pairedDevice.DeviceID, Name: pairedDevice.Name}
	e.set = true
	return e
}

// SetAnimeID records the anime identifier the request targeted.
func (e *CaptureEnrichment) SetAnimeID(animeID string) *CaptureEnrichment {
	e.animeID = &animeID
	e.set = true
	return e
}

// SetErrorCode records the semantic error code for a rejected/malformed outcome.
func (e *CaptureEnrichment) SetErrorCode(errorCode string) *CaptureEnrichment {
	e.errorCode = errorCode
	e.set = true
	return e
}

// SetPayload records the sanitized semantic payload projection.
func (e *CaptureEnrichment) SetPayload(payload map[string]any) *CaptureEnrichment {
	e.payload = payload
	e.set = true
	return e
}

// AddConflictID appends one OCC conflict identifier. A blank id is ignored.
func (e *CaptureEnrichment) AddConflictID(conflictID string) *CaptureEnrichment {
	if conflictID == "" {
		return e
	}
	e.correlations.ConflictIDs = append(e.correlations.ConflictIDs, conflictID)
	e.set = true
	return e
}

// AddChangelogIDs appends the provided changelog identifiers.
func (e *CaptureEnrichment) AddChangelogIDs(changelogIDs ...int64) *CaptureEnrichment {
	if len(changelogIDs) == 0 {
		return e
	}
	e.correlations.ChangelogIDs = append(e.correlations.ChangelogIDs, changelogIDs...)
	e.set = true
	return e
}

// SetOperationRefs records the per-operation reconcile correlation refs.
func (e *CaptureEnrichment) SetOperationRefs(refs []OperationRef) *CaptureEnrichment {
	e.correlations.OperationRefs = refs
	e.set = true
	return e
}
