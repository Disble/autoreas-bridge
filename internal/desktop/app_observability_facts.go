package desktop

import (
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/syncdiag"
)

// GetObservabilityFacts is the Wails-bound read of the desktop adapter's
// static observability facts: the parity statement over the readcap catalog
// (exposed capabilities, excluded capabilities with their mechanical reasons,
// and the catalog total), each observability store's retention limit, and
// each summary's bounded sample size, all reported from the owning packages
// so no surface has to copy a cap or a row count.
//
// The degrade convention follows the neighbouring observability bindings: the
// facts describe an adapter wired over live stores, so an unwired read path
// (a nil bridge database or any nil reader) yields a zeroed result with
// Degraded set -- never a panic, and both lists stay non-nil so the wire
// never carries a JSON null.
func (a *App) GetObservabilityFacts() contracts.ObservabilityFacts {
	if a.bridgeDB == nil || a.captureReader == nil || a.eventReader == nil || a.syncDiagReader == nil {
		return degradedObservabilityFacts()
	}

	return contracts.ObservabilityFacts{
		Parity: ObservabilityParityFacts(),
		Retention: contracts.ObservabilityRetentionLimits{
			CaptureRows:        requestcapture.RetentionLimit(),
			EventRows:          eventlog.RowCap(),
			SyncDiagnosticRows: syncdiag.RetentionLimit(),
		},
		SampleCaps: contracts.ObservabilitySampleCaps{
			EventSamples:        eventlog.SummarySampleCap(),
			CaptureErrorSamples: requestcapture.SummaryErrorSampleLimit(),
		},
	}
}

// degradedObservabilityFacts builds the zeroed envelope for an unwired read
// path. Both lists are non-nil empty slices so a degraded result is rangeable
// without a nil check, and the retention limits stay zero: an unwired adapter
// must never present a limit as if it had been measured.
func degradedObservabilityFacts() contracts.ObservabilityFacts {
	return contracts.ObservabilityFacts{
		Parity: contracts.ObservabilityParityFacts{
			ExposedCapabilities:  []string{},
			ExcludedCapabilities: []contracts.ObservabilityExcludedCapability{},
		},
		Retention:  contracts.ObservabilityRetentionLimits{},
		SampleCaps: contracts.ObservabilitySampleCaps{},
		Degraded:   true,
	}
}
