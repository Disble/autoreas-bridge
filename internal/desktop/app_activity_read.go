package desktop

import (
	"errors"
	"net/http"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/activityread"
	"autoreas-bridge/internal/observability/requestcapture"
)

// errActivityUnavailable reports an Activity read before the bridge database
// or the capture reader is wired.
var errActivityUnavailable = errors.New("activity: bridge database unavailable")

// ActivityIncidentResult is the Incidents detail answer. Found is false when
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

// GetActivityNow answers "is everything fine right now?" from the app's clock,
// its local midnight and its process start.
func (a *App) GetActivityNow() (activityread.NowView, error) {
	reader, err := a.activityReader()
	if err != nil {
		return activityread.NowView{}, err
	}
	now := a.currentTime()
	return reader.Now(a.seasonCtx(), activityread.NowInput{
		Now:              now,
		LocalMidnight:    time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()),
		ProcessStartedAt: a.processStartedAt,
	})
}

// ListActivityIncidents returns the incident list of one "where it happened" filter.
func (a *App) ListActivityIncidents(where string) ([]activityread.IncidentSummary, error) {
	reader, err := a.activityReader()
	if err != nil {
		return nil, err
	}
	return reader.Incidents(a.seasonCtx(), activityread.IncidentsInput{Now: a.currentTime(), Where: activityread.Where(where)})
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

// SearchActivityHistory returns one History page; cursor is empty for the first page.
func (a *App) SearchActivityHistory(where, cursor string, limit int) (activityread.HistoryView, error) {
	reader, err := a.activityReader()
	if err != nil {
		return activityread.HistoryView{}, err
	}
	return reader.History(a.seasonCtx(), activityread.HistoryInput{
		Now: a.currentTime(), Where: activityread.Where(where), Cursor: cursor, Limit: limit,
	})
}

// ListActivityRecoveredRuns returns the recovered runs of one "where it
// happened" filter: the runs the Incidents tab lists beside its incidents.
func (a *App) ListActivityRecoveredRuns(where string) ([]activityread.Run, error) {
	reader, err := a.activityReader()
	if err != nil {
		return nil, err
	}
	return reader.Runs(a.seasonCtx(), activityread.RunsInput{Now: a.currentTime(), Where: activityread.Where(where), RecoveredOnly: true})
}

// GetActivityRunStory returns the ordered steps of one correlation id.
func (a *App) GetActivityRunStory(correlationID string) (activityread.RunStory, error) {
	reader, err := a.activityReader()
	if err != nil {
		return activityread.RunStory{}, err
	}
	return reader.RunStory(a.seasonCtx(), correlationID)
}

// ListActivityRecorder returns one page of the 2-hour recorder, newest first.
func (a *App) ListActivityRecorder(cursor string, limit int) (activityread.RecorderPage, error) {
	reader, err := a.activityReader()
	if err != nil {
		return activityread.RecorderPage{}, err
	}
	return reader.Recorder(a.seasonCtx(), activityread.RecorderInput{Now: a.currentTime(), Cursor: cursor, Limit: limit})
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
