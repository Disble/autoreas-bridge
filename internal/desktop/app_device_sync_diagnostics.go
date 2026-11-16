package desktop

import (
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/telemetry"
)

// ListDeviceSyncDiagnostics is the Wails-bound read of a device's own sync
// diagnostics reports over the kind-discriminated device_telemetry_events
// store -- the only store that can attribute a report to a device. It reads
// the cycle_report kind, which is the same kind the ingestion path writes, so
// a report stored by mobile is visible here. It runs through the observability
// module handle: while the module starts or after it failed, and when the read
// fails, it returns the error instead of an empty page. A read with no reports
// answers an Items slice that is never JSON null.
func (a *App) ListDeviceSyncDiagnostics(query contracts.DeviceSyncDiagnosticsQuery) (contracts.DeviceSyncDiagnosticsResult, error) {
	return a.moduleSet().observability.Use(func(services observabilityServices) (contracts.DeviceSyncDiagnosticsResult, error) {
		reports, err := services.syncDiagnostics.ListCycleReports(a.seasonCtx(), telemetry.CycleReportQuery{
			DeviceID: query.DeviceID,
			Limit:    query.Limit,
		})
		if err != nil {
			return contracts.DeviceSyncDiagnosticsResult{}, err
		}
		items := make([]contracts.DeviceSyncDiagnosticReport, 0, len(reports))
		for _, report := range reports {
			items = append(items, toDeviceSyncDiagnosticReport(report))
		}
		return contracts.DeviceSyncDiagnosticsResult{Items: items}, nil
	})
}

// toDeviceSyncDiagnosticReport maps one projected cycle report into the bound
// wire DTO. The nullable values are carried as pointers verbatim, so an absent
// degraded marker or previous-cycle value never renders as a zero value.
func toDeviceSyncDiagnosticReport(report telemetry.CycleReport) contracts.DeviceSyncDiagnosticReport {
	return contracts.DeviceSyncDiagnosticReport{
		DeviceID:                  report.DeviceID,
		ReportedAtMS:              report.ReportedAtMS,
		CycleID:                   report.CycleID,
		Degraded:                  report.Degraded,
		TriggerSource:             report.TriggerSource,
		AppState:                  report.AppState,
		ConsecutiveUnclosedCycles: report.ConsecutiveUnclosedCycles,
		PendingOpsCount:           report.PendingOpsCount,
		Cursor:                    report.Cursor,
		PreviousOutcome:           report.PreviousOutcome,
		PreviousElapsedMS:         report.PreviousElapsedMS,
		PreviousErrorFingerprint:  report.PreviousErrorFingerprint,
	}
}
