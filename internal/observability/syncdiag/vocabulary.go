package syncdiag

// This file owns the 11 closed vocabularies the wire envelope is validated
// against. Each is a distinctly named set, even where two sets share
// members: top-level trigger_source and previous_cycle.trigger_source
// answer different questions (who sent this telemetry vs. who ran the
// previous cycle) and MUST NOT be collapsed into one shared set -- doing so
// would silently make one position wrong.

// telemetrySenderTriggerSources gates the top-level trigger_source field:
// which scheduler sent this telemetry. Only the two headless call sites
// ever supply a value, so an off-list member is a client bug worth failing
// loudly.
var telemetrySenderTriggerSources = map[string]struct{}{
	"foreground_service": {},
	"background_task":    {},
}

// syncAttemptTriggerSources gates previous_cycle.trigger_source: which
// scheduler ran the previous cycle. Any sync-recording caller writes this
// column, including foreground paths that never send telemetry, so it
// carries the full nine-member vocabulary -- the two senders above plus
// every other caller of the sync machinery.
var syncAttemptTriggerSources = map[string]struct{}{
	"foreground_service":   {},
	"background_task":      {},
	"bootstrap":            {},
	"manual":               {},
	"app_active":           {},
	"network_regained":     {},
	"local_mutation":       {},
	"local_mutation_write": {},
	"ws_sync_required":     {},
}

// telemetryAppStates gates app_state. The client hardcodes this to
// "background" today, so a foreground_service cycle also reports
// "background" -- app_state is stored but never a trustworthy filter
// dimension; trigger_source is.
var telemetryAppStates = map[string]struct{}{
	"foreground": {},
	"background": {},
}

// syncOutcomes gates previous_cycle.outcome, the only field of
// previous_cycle required non-null whenever previous_cycle itself is
// present.
var syncOutcomes = map[string]struct{}{
	"completed":    {},
	"failed":       {},
	"never_closed": {},
}

// syncStages gates previous_cycle.last_stage.
var syncStages = map[string]struct{}{
	"open":            {},
	"config":          {},
	"attempt_started": {},
	"cycle_activated": {},
	"backlog_read":    {},
	"claim_ops":       {},
	"http":            {},
	"parse_response":  {},
	"apply_write":     {},
	"prune":           {},
	"closed":          {},
}

// syncErrorNames gates previous_cycle.error_name. "unknown" is a legitimate
// member, not a rejected value -- it names the unrecognized-error class.
var syncErrorNames = map[string]struct{}{
	"LocalWriteError":        {},
	"BridgeTimeoutError":     {},
	"BridgeUnreachableError": {},
	"ReconcileHttpError":     {},
	"SchemaValidationError":  {},
	"unknown":                {},
}

// syncErrorStages gates previous_cycle.error_stage. "unknown" is a
// legitimate member.
var syncErrorStages = map[string]struct{}{
	"begin":    {},
	"task":     {},
	"commit":   {},
	"rollback": {},
	"deadline": {},
	"unknown":  {},
}

// syncErrorCauses gates previous_cycle.error_cause. "unknown" is a
// legitimate member.
var syncErrorCauses = map[string]struct{}{
	"closed_resource": {},
	"lock_contention": {},
	"disk_full":       {},
	"io_error":        {},
	"timeout":         {},
	"unreachable":     {},
	"unknown":         {},
}

// recentEventSources gates recent_events[].source.
var recentEventSources = map[string]struct{}{
	"sync_cycle":         {},
	"websocket":          {},
	"mutation":           {},
	"foreground_resync":  {},
	"background_task":    {},
	"startup":            {},
	"reconcile_conflict": {},
}

// recentEventTypes gates recent_events[].event.
var recentEventTypes = map[string]struct{}{
	"ws_opened":                    {},
	"ws_closed":                    {},
	"ws_error":                     {},
	"ws_reconnect_scheduled":       {},
	"mutation_failed":              {},
	"mutation_sync_failed":         {},
	"resync_failed":                {},
	"write_failed":                 {},
	"headless_task_registered":     {},
	"headless_task_missing":        {},
	"conflict_reason_unrecognized": {},
	"conflict_token_missing":       {},
	"conflict_operation_stalled":   {},
}

// degradedReasons gates the top-level degraded field. Each value implies
// every lighter piece is ABSENT from this payload -- shed or never present
// -- never that a lighter piece was dropped. See the DDL comment on
// device_sync_diagnostics.degraded in schema.go for the full rule.
var degradedReasons = map[string]struct{}{
	"events":         {},
	"error_detail":   {},
	"previous_cycle": {},
}

// inVocabulary reports whether value is a member of vocabulary.
func inVocabulary(vocabulary map[string]struct{}, value string) bool {
	_, ok := vocabulary[value]
	return ok
}
