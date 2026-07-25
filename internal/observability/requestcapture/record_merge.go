package requestcapture

import "autoreas-bridge/internal/api/contracts"

// BuildTransportCaptureRecord builds the transport-only arrival shape of a
// capture record: request id, captured-at timestamp, and route facts, with a
// pending outcome and no semantic content. The capture middleware/decorator
// enqueues this before the handler runs, then later merges it with the
// request-scoped CaptureEnrichment via MergeEnrichment to produce the
// terminal record.
func BuildTransportCaptureRecord(requestID string, capturedAtMS int64, kind, route, transport string) CaptureRecord {
	return CaptureRecord{
		RequestID:    requestID,
		CapturedAtMS: capturedAtMS,
		Kind:         kind,
		Route:        route,
		Transport:    transport,
		Outcome:      "pending",
		Correlations: Correlations{OperationRefs: []OperationRef{}},
	}
}

// MergeEnrichment overlays the semantic facts collected on enr (device,
// outcome, error code, anime id, payload, correlations) onto a copy of
// transport, leaving every transport-derived field (request id, timing,
// route, HTTP status, headers, body) untouched. When enr never received a
// setter call (e.g. the handler panicked before contributing anything, or a
// caller ran off-middleware), transport is returned unchanged so the record
// stays a valid transport-only terminal row.
func MergeEnrichment(transport CaptureRecord, enr *CaptureEnrichment) CaptureRecord {
	merged := transport
	if enr == nil || !enr.set {
		return merged
	}
	merged.Device = enr.device
	merged.Outcome = enr.outcome
	merged.ErrorCode = enr.errorCode
	merged.AnimeID = enr.animeID
	merged.Payload = enr.payload
	merged.Correlations = enr.correlations
	return merged
}

// PatchPayload projects a PATCH request into the sanitized semantic payload
// shape previously produced by the retired BuildPatchCaptureRecord builder.
func PatchPayload(patch contracts.AnimePatch) map[string]any {
	payload := map[string]any{}
	if patch.Estado != nil {
		payload["status"] = *patch.Estado
	}
	if patch.NroCapVisto != nil {
		payload["episodesWatched"] = *patch.NroCapVisto
	}
	if len(patch.Dias) > 0 {
		payload["days"] = append([]string(nil), patch.Dias...)
	}
	if patch.FechaUltCapVisto != nil {
		payload["lastWatchedAt"] = *patch.FechaUltCapVisto
	}
	if patch.Base != nil {
		payload["base"] = *patch.Base
	}
	return payload
}

// ReconcilePayload projects a reconcile request into the sanitized semantic
// payload shape previously produced by the retired BuildReconcileCaptureRecord
// builder: the last acknowledged changelog id plus one projection per pending
// operation.
func ReconcilePayload(request contracts.ReconcileRequest) map[string]any {
	return map[string]any{
		"last_changelog_id":  request.LastChangelogID,
		"pending_operations": pendingOperationsPayload(request.PendingOperations),
	}
}

// pendingOperationsPayload projects each pending operation into its sanitized
// capture shape.
func pendingOperationsPayload(operations []contracts.PendingOperation) []map[string]any {
	pendingOperations := make([]map[string]any, 0, len(operations))
	for _, operation := range operations {
		pendingOperations = append(pendingOperations, map[string]any{
			"anime_id":   operation.AnimeID,
			"operation":  operation.Operation,
			"created_at": operation.CreatedAt,
			"payload":    pendingOperationPayload(operation.Payload),
		})
	}
	return pendingOperations
}

// pendingOperationPayload extracts the allowlisted keys from one pending
// operation's raw JSON payload.
func pendingOperationPayload(raw map[string]any) map[string]any {
	payload := map[string]any{}
	if status, ok := intPayload(raw, "status"); ok {
		payload["status"] = status
	}
	if episodesWatched, ok := floatPayload(raw, "episodesWatched"); ok {
		payload["episodesWatched"] = episodesWatched
	}
	if days, ok := stringSlicePayload(raw, "days"); ok {
		payload["days"] = days
	}
	if lastWatchedAt, ok := int64Payload(raw, "lastWatchedAt"); ok {
		payload["lastWatchedAt"] = lastWatchedAt
	}
	if base, ok := int64Payload(raw, "base"); ok {
		payload["base"] = base
	}
	return payload
}
