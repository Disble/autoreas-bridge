package desktop

import (
	"strconv"

	"autoreas-bridge/internal/observability/activityread"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/requestcapture"
)

// activityRecorderEventName is the Wails runtime event carrying one Live
// recorder row each time a capture or a runtime event is persisted. The Now
// view refreshes on it too.
const activityRecorderEventName = "activity.recorder"

// emitActivityRecorder streams one recorder row to the frontend. It runs in
// a queue's drain goroutine after the row persisted; the Wails emit only
// dispatches, so it does not hold the drain. Nil-safe before startup.
func (a *App) emitActivityRecorder(entry activityread.RecorderEntry) {
	if a.ctx == nil || a.emitFn == nil {
		return
	}
	a.emitFn(a.ctx, activityRecorderEventName, entry)
}

// captureRecorderEntry projects a persisted capture onto the recorder row the
// recorder query reads from request_captures.
func captureRecorderEntry(record requestcapture.CaptureRecord) activityread.RecorderEntry {
	return activityread.RecorderEntry{
		Source:     activityread.SourceRequest,
		ID:         record.RequestID,
		AtMS:       record.CapturedAtMS,
		Kind:       record.Kind,
		Route:      record.Route,
		HTTPStatus: record.HTTPStatus,
		Outcome:    record.Outcome,
		DurationMS: record.DurationMS,
		DeviceName: record.Device.Name,
		ErrorCode:  record.ErrorCode,
	}
}

// eventRecorderEntry projects a persisted runtime event onto the recorder row
// the recorder query reads from runtime_events. The event store hands back no
// row id, so ID stays empty unless the record carries one; a zero duration is
// stored as NULL, so it projects as nil.
func eventRecorderEntry(record eventlog.EventRecord) activityread.RecorderEntry {
	entry := activityread.RecorderEntry{
		Source:        activityread.SourceEvent,
		AtMS:          record.OccurredAtMS,
		Domain:        record.Domain,
		Level:         record.Level,
		EventType:     record.EventType,
		Message:       record.Message,
		CorrelationID: record.CorrelationID,
	}
	if record.ID != 0 {
		entry.ID = strconv.FormatInt(record.ID, 10)
	}
	if record.DurationMS != 0 {
		duration := record.DurationMS
		entry.DurationMS = &duration
	}
	return entry
}
