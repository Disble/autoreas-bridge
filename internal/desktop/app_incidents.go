package desktop

import (
	"context"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/incident"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/telemetry"
)

// incidentLogDomain is the runtime-event domain of incident-recording failures.
const incidentLogDomain = "observability"

// incidentRecordFailedEventType marks the error event logged when an incident
// could not be recorded. The event persist hook skips it: an error about
// failing to record an incident must not try to record another incident,
// which would fail and log again without end.
const incidentRecordFailedEventType = "incident.record_failed"

// incidentRecordBudget bounds one incident write. It runs inside a queue's
// drain goroutine, so it must not hold the drain for long.
const incidentRecordBudget = 250 * time.Millisecond

// onCapturePersisted is the capture queue's OnPersist hook: it streams the
// persisted row to the Live recorder and records an incident when the row triggers.
func (a *App) onCapturePersisted(record requestcapture.CaptureRecord) {
	a.emitActivityRecorder(captureRecorderEntry(record))
	a.recordRequestIncident(record)
}

// recordRequestIncident classifies one persisted capture row and records an
// incident when it triggers. A pending arrival row carries no status and no
// duration, so it never triggers.
func (a *App) recordRequestIncident(record requestcapture.CaptureRecord) {
	observedAt := time.UnixMilli(record.CapturedAtMS)
	trigger, ok := incident.ClassifyRequest(incident.RequestFact{
		Kind:         record.Kind,
		Transport:    record.Transport,
		HTTPStatus:   record.HTTPStatus,
		Outcome:      record.Outcome,
		ErrorCode:    record.ErrorCode,
		DurationMS:   record.DurationMS,
		ObservedAt:   observedAt,
		ProcessStart: a.processStartedAt,
	})
	if !ok {
		return
	}
	a.recordIncident(incident.Occurrence{
		Trigger: trigger, OccurredAt: observedAt, SourceKind: incident.SourceRequest, SourceID: record.RequestID,
	})
}

// onEventPersisted is the event queue's OnPersist hook: it streams the
// persisted event to the Live recorder and records an incident when it triggers.
func (a *App) onEventPersisted(record eventlog.EventRecord) {
	a.emitActivityRecorder(eventRecorderEntry(record))
	a.recordEventIncident(record)
}

// recordEventIncident records an incident for a persisted event that
// triggers, except for the app's own incident-recording failures.
func (a *App) recordEventIncident(record eventlog.EventRecord) {
	if record.EventType == incidentRecordFailedEventType {
		return
	}
	trigger, ok := incident.ClassifyEvent(incident.EventFact{
		Domain: record.Domain, Level: record.Level, EventType: record.EventType,
	})
	if !ok {
		return
	}
	// The eventlog store does not hand back the row id, so the source is
	// located by its time and fingerprint (domain and event type) instead.
	a.recordIncident(incident.Occurrence{
		Trigger: trigger, OccurredAt: time.UnixMilli(record.OccurredAtMS), SourceKind: incident.SourceEvent,
	})
}

// recordMobileIncident records an incident for a stored mobile telemetry
// report that describes a failure.
func (a *App) recordMobileIncident(event telemetry.Event) {
	facts := telemetry.ReadReportFacts(event.Kind, event.Validated.Payload)
	trigger, ok := incident.ClassifyMobileReport(incident.MobileReportFact{
		Kind: event.Kind, Outcome: facts.Outcome, Phase: facts.Phase, Cause: facts.Cause, DurationMS: facts.DurationMS,
	})
	if !ok {
		return
	}
	a.recordIncident(incident.Occurrence{
		Trigger: trigger, OccurredAt: time.UnixMilli(event.ReportedAtMS), SourceKind: incident.SourceMobile,
		SourceID: event.Validated.EventID,
	})
}

// recordIncident persists one occurrence. A failure is logged and never
// returned: the write that fired the trigger has already succeeded and must
// not be affected.
func (a *App) recordIncident(occurrence incident.Occurrence) {
	if a.bridgeDB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), incidentRecordBudget)
	defer cancel()
	err := incident.NewStore(a.bridgeDB).Record(ctx, occurrence)
	if err == nil || a.sharedLogger == nil {
		return
	}
	a.sharedLogger.Logf(incidentLogDomain, sharedlogger.LevelError, sharedlogger.Fields{
		EventType: incidentRecordFailedEventType,
		Metadata: map[string]any{
			"reason": string(occurrence.Trigger.Reason), "sourceKind": string(occurrence.SourceKind),
		},
	}, "failed to record %s incident: %v", occurrence.Trigger.Reason, err)
}
