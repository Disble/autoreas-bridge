package main

import (
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/requestcapture"
)

// ListCaptureTransactions is the Wails-bound read of captured HTTP
// transactions (design.md "Bound surface"): list + filters + cursor
// pagination over the app's own in-process reader. Never panics: a nil
// reader or a query error degrades to an empty, Degraded page.
func (a *App) ListCaptureTransactions(query contracts.CaptureQuery) contracts.CapturePage {
	if a.captureReader == nil {
		return contracts.CapturePage{Items: []contracts.CaptureRow{}, Degraded: true}
	}
	page, err := a.captureReader.Search(a.seasonCtx(), toSearchParams(query))
	if err != nil {
		return contracts.CapturePage{Items: []contracts.CaptureRow{}, Degraded: true}
	}
	return toCapturePage(page)
}

// GetCaptureTransaction is the Wails-bound single-transaction detail read.
// Found=false with Degraded=false means "no such request id"; Degraded=true
// means the reader itself is unavailable or the query failed.
func (a *App) GetCaptureTransaction(requestID string) contracts.CaptureDetailResult {
	if a.captureReader == nil {
		return contracts.CaptureDetailResult{Degraded: true}
	}
	result, err := a.captureReader.Get(a.seasonCtx(), requestID)
	if err != nil {
		return contracts.CaptureDetailResult{Degraded: true}
	}
	if !result.Found {
		return contracts.CaptureDetailResult{}
	}
	return contracts.CaptureDetailResult{Found: true, Item: toCaptureDetail(result.Item)}
}

// toSearchParams maps a CaptureQuery into the reader's SearchParams/SearchFilters shape.
func toSearchParams(query contracts.CaptureQuery) requestcapture.SearchParams {
	return requestcapture.SearchParams{
		Limit:  query.Limit,
		Cursor: query.Cursor,
		Filters: requestcapture.SearchFilters{
			Route:      query.Route,
			HTTPStatus: query.HTTPStatus,
			Outcome:    query.Outcome,
			Kind:       query.Kind,
			AnimeID:    query.AnimeID,
			ErrorCode:  query.ErrorCode,
			StartMS:    query.StartMS,
			EndMS:      query.EndMS,
		},
	}
}

// toCapturePage maps a reader SearchPage into the bound CapturePage DTO.
func toCapturePage(page requestcapture.SearchPage) contracts.CapturePage {
	items := make([]contracts.CaptureRow, 0, len(page.Items))
	for _, record := range page.Items {
		items = append(items, toCaptureRow(record))
	}
	return contracts.CapturePage{
		Items:                items,
		NextCursor:           page.NextCursor,
		AppliedLimit:         page.AppliedLimit,
		MalformedRowsSkipped: page.MalformedRowsSkipped,
		WarningCount:         page.WarningCount,
	}
}

// toCaptureRow maps one reader CaptureRecord into the list-row DTO.
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
