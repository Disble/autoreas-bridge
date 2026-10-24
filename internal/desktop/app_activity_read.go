package desktop

import (
	"errors"
	"net/http"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/activityread"
	"autoreas-bridge/internal/observability/requestcapture"
)

// errActivityUnavailable reports an Activity read before the bridge database
// or the capture reader is wired.
var errActivityUnavailable = errors.New("activity: bridge database unavailable")

// ActivityIncidentResult is the incident detail answer. Found is false when
// the occurrence is no longer stored, which the UI shows as gone, not failed.
type ActivityIncidentResult struct {
	Found  bool                        `json:"found"`
	Detail activityread.IncidentDetail `json:"detail"`
}

// ActivityRequestResult is one captured request with its bodies. Found is
// false when the capture is no longer stored.
type ActivityRequestResult struct {
	Found  bool                    `json:"found"`
	Detail contracts.CaptureDetail `json:"detail"`
}

// activityReader builds the Activity read service over the app's own bridge
// database handle. Building it is free, so nothing is cached.
func (a *App) activityReader() (*activityread.Reader, error) {
	if a.bridgeDB == nil {
		return nil, errActivityUnavailable
	}
	return activityread.New(a.bridgeDB), nil
}

// GetActivityIncident returns one incident occurrence with its cause and window.
func (a *App) GetActivityIncident(id int64) (ActivityIncidentResult, error) {
	reader, err := a.activityReader()
	if err != nil {
		return ActivityIncidentResult{}, err
	}
	detail, err := reader.IncidentDetail(a.seasonCtx(), id)
	if errors.Is(err, activityread.ErrNotFound) {
		return ActivityIncidentResult{}, nil
	}
	if err != nil {
		return ActivityIncidentResult{}, err
	}
	return ActivityIncidentResult{Found: true, Detail: detail}, nil
}

// GetActivityRunStory returns the ordered steps of one correlation id.
func (a *App) GetActivityRunStory(correlationID string) (activityread.RunStory, error) {
	reader, err := a.activityReader()
	if err != nil {
		return activityread.RunStory{}, err
	}
	return reader.RunStory(a.seasonCtx(), correlationID)
}

// GetActivityRequest returns one captured request with its bodies and headers.
// Credential headers are redacted again on the way out, so a row stored before
// write-time redaction never hands a token to the UI.
func (a *App) GetActivityRequest(requestID string) (ActivityRequestResult, error) {
	if a.captureReader == nil {
		return ActivityRequestResult{}, errActivityUnavailable
	}
	result, err := a.captureReader.Get(a.seasonCtx(), requestID)
	if err != nil || !result.Found {
		return ActivityRequestResult{}, err
	}
	detail := toCaptureDetail(result.Item)
	detail.RequestHeaders = redactCredentialHeaders(detail.RequestHeaders)
	detail.ResponseHeaders = redactCredentialHeaders(detail.ResponseHeaders)
	return ActivityRequestResult{Found: true, Detail: detail}, nil
}

// redactCredentialHeaders runs stored headers through the capture write path's
// own sanitizer. A nil map stays nil.
func redactCredentialHeaders(headers map[string]string) map[string]string {
	if headers == nil {
		return nil
	}
	header := make(http.Header, len(headers))
	for name, value := range headers {
		header[name] = []string{value}
	}
	return requestcapture.SanitizeHeaders(header)
}
