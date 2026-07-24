package mobilecapture

import (
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"github.com/google/uuid"
)

// BuildPatchCaptureRecord projects a PATCH request into the sanctioned capture shape.
func BuildPatchCaptureRecord(device device.PairedDevice, animeID string, patch contracts.AnimePatch, outcome string, httpStatus int, errorCode string) CaptureRecord {
	record := baseRecord(device, "patch", "/api/animes/"+animeID, "http", outcome, errorCode)
	record.AnimeID = stringPtr(animeID)
	record.HTTPStatus = intPtr(httpStatus)
	record.Payload = map[string]any{}
	if patch.Estado != nil {
		record.Payload["status"] = *patch.Estado
	}
	if patch.NroCapVisto != nil {
		record.Payload["episodesWatched"] = *patch.NroCapVisto
	}
	if len(patch.Dias) > 0 {
		record.Payload["days"] = append([]string(nil), patch.Dias...)
	}
	if patch.FechaUltCapVisto != nil {
		record.Payload["lastWatchedAt"] = *patch.FechaUltCapVisto
	}
	if patch.Base != nil {
		record.Payload["base"] = *patch.Base
	}
	return record
}

// BuildReconcileCaptureRecord projects a REST/WS reconcile request into the sanctioned capture shape.
func BuildReconcileCaptureRecord(device device.PairedDevice, kind string, route string, transport string, request contracts.ReconcileRequest, outcome string, httpStatus *int, errorCode string, operationRefs []OperationRef, changelogIDs []int64) CaptureRecord {
	record := baseRecord(device, kind, route, transport, outcome, errorCode)
	record.HTTPStatus = httpStatus
	record.Payload = map[string]any{"last_changelog_id": request.LastChangelogID}
	pendingOperations := make([]map[string]any, 0, len(request.PendingOperations))
	for _, operation := range request.PendingOperations {
		payload := map[string]any{}
		if status, ok := intPayload(operation.Payload, "status"); ok {
			payload["status"] = status
		}
		if episodesWatched, ok := floatPayload(operation.Payload, "episodesWatched"); ok {
			payload["episodesWatched"] = episodesWatched
		}
		if days, ok := stringSlicePayload(operation.Payload, "days"); ok {
			payload["days"] = days
		}
		if lastWatchedAt, ok := int64Payload(operation.Payload, "lastWatchedAt"); ok {
			payload["lastWatchedAt"] = lastWatchedAt
		}
		if base, ok := int64Payload(operation.Payload, "base"); ok {
			payload["base"] = base
		}
		pendingOperations = append(pendingOperations, map[string]any{
			"anime_id":   operation.AnimeID,
			"operation":  operation.Operation,
			"created_at": operation.CreatedAt,
			"payload":    payload,
		})
	}
	record.Payload["pending_operations"] = pendingOperations
	record.Correlations = Correlations{
		ChangelogIDs:  append([]int64(nil), changelogIDs...),
		OperationRefs: append([]OperationRef(nil), operationRefs...),
	}
	return record
}

// baseRecord builds the shared skeleton for a sanitized capture record.
func baseRecord(device device.PairedDevice, kind string, route string, transport string, outcome string, errorCode string) CaptureRecord {
	return CaptureRecord{
		RequestID:    uuid.NewString(),
		CapturedAtMS: time.Now().UnixMilli(),
		Kind:         kind,
		Route:        route,
		Transport:    transport,
		Device:       DeviceIdentity{DeviceID: device.DeviceID, Name: device.Name},
		Outcome:      outcome,
		Correlations: Correlations{OperationRefs: []OperationRef{}},
		ErrorCode:    errorCode,
	}
}

// intPayload extracts an integer payload value, accepting JSON float inputs.
func intPayload(payload map[string]any, key string) (int, bool) {
	value, ok := payload[key]
	if !ok {
		return 0, false
	}
	floatValue, ok := value.(float64)
	if !ok {
		return 0, false
	}
	return int(floatValue), true
}

// floatPayload extracts a float64 payload value.
func floatPayload(payload map[string]any, key string) (float64, bool) {
	value, ok := payload[key]
	if !ok {
		return 0, false
	}
	floatValue, ok := value.(float64)
	return floatValue, ok
}

// int64Payload extracts an int64 payload value, accepting JSON float inputs.
func int64Payload(payload map[string]any, key string) (int64, bool) {
	value, ok := floatPayload(payload, key)
	if !ok {
		return 0, false
	}
	return int64(value), true
}

// stringSlicePayload extracts a string slice payload value.
func stringSlicePayload(payload map[string]any, key string) ([]string, bool) {
	value, ok := payload[key]
	if !ok {
		return nil, false
	}
	items, ok := value.([]any)
	if !ok {
		return nil, false
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if !ok {
			return nil, false
		}
		result = append(result, text)
	}
	return result, true
}

// stringPtr returns a pointer to the provided string value.
func stringPtr(value string) *string { return &value }

// intPtr returns a pointer to the provided integer value.
func intPtr(value int) *int { return &value }
