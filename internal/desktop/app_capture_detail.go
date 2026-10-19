package desktop

import (
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/requestcapture"
)

// toCaptureRow maps one reader CaptureRecord into the row part of the detail DTO.
func toCaptureRow(record requestcapture.CaptureRecord) contracts.CaptureRow {
	return contracts.CaptureRow{
		RequestID:    record.RequestID,
		CapturedAtMS: record.CapturedAtMS,
		Kind:         record.Kind,
		Route:        record.Route,
		Transport:    record.Transport,
		Outcome:      record.Outcome,
		ErrorCode:    record.ErrorCode,
		HTTPStatus:   record.HTTPStatus,
		DurationMS:   record.DurationMS,
		AnimeID:      record.AnimeID,
	}
}

// toCaptureDetail maps one reader CaptureRecord into the full detail DTO.
func toCaptureDetail(record requestcapture.CaptureRecord) contracts.CaptureDetail {
	return contracts.CaptureDetail{
		CaptureRow:        toCaptureRow(record),
		Payload:           record.Payload,
		RequestBody:       record.RequestBody,
		RequestBodyState:  record.RequestBodyState,
		ResponseBody:      record.ResponseBody,
		ResponseBodyState: record.ResponseBodyState,
		RequestHeaders:    record.RequestHeaders,
		ResponseHeaders:   record.ResponseHeaders,
		Correlations:      toCaptureCorrelations(record.Correlations),
		DeviceID:          record.Device.DeviceID,
		DeviceName:        record.Device.Name,
	}
}

// toCaptureCorrelations maps the reader's Correlations into the contracts
// mirror type (see internal/api/contracts/capture.go doc comment for why
// contracts cannot import requestcapture directly).
func toCaptureCorrelations(correlations requestcapture.Correlations) contracts.CaptureCorrelations {
	refs := make([]contracts.CaptureOperationRef, 0, len(correlations.OperationRefs))
	for _, ref := range correlations.OperationRefs {
		refs = append(refs, contracts.CaptureOperationRef{
			AnimeID:   ref.AnimeID,
			Operation: ref.Operation,
			Outcome:   ref.Outcome,
		})
	}
	return contracts.CaptureCorrelations{
		ChangelogIDs:  correlations.ChangelogIDs,
		OperationRefs: refs,
		ConflictIDs:   correlations.ConflictIDs,
		ActivityIDs:   correlations.ActivityIDs,
	}
}
