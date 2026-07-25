package requestcapture

// This file holds the shared JSON-payload extractors that record_merge.go's
// ReconcilePayload/pendingOperationPayload reuse. The record builders that
// used to live here (BuildPatchCaptureRecord, BuildReconcileCaptureRecord +
// baseRecord) are retired: superseded by BuildTransportCaptureRecord +
// MergeEnrichment (record_merge.go) once every capture site (HTTP middleware,
// WS decorator) moved to the enrichment-carrier pattern.

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
