// Package syncreading is Bridge's interpretation of a failed sync report
// (docs/observability/mobile-reports.md, Reading a failed sync). A report is
// data: it records what mobile saw. A reading is computed from it and never
// stored in it, so this package only decides. Its callers hand it the failure
// and the Bridge starts; it touches no database and keeps no state.
package syncreading

import (
	"encoding/json"
	"slices"
	"time"

	"autoreas-bridge/internal/observability/telemetry"
)

const (
	// ArrivalWindow is how long after the start that received it a report may
	// arrive and still count as waiting for Bridge. Approved by the owner on
	// 2026-11-06.
	ArrivalWindow = 30 * time.Minute

	// LastContactsKey is the api.listening metadata key holding each active
	// device's last contact at that start.
	LastContactsKey = "lastContacts"

	// failedOutcome and syncPhase are the stored episode_action values a
	// report needs for a reading.
	failedOutcome = "failed"
	syncPhase     = "sync"
)

// Reading is what Bridge makes of one failed sync report.
type Reading string

const (
	// NoReading means nothing can be said: the failure is older than the
	// oldest retained start, so it stays a plain failure.
	NoReading Reading = ""
	// BridgeOff means the change waited for Bridge to start. It is not a failure.
	BridgeOff Reading = "bridge_off"
	// TabletLate means Bridge was off, but the tablet reported long after it came back.
	TabletLate Reading = "tablet_late"
	// RealFailure means Bridge was on when the sync failed.
	RealFailure Reading = "real_failure"
)

// Start is one Bridge start: one api.listening row, or the running process
// before that row is stored. LastContacts holds each active device's last
// contact in epoch milliseconds; a start older than this record holds none.
type Start struct {
	AtMS         int64
	LastContacts map[string]int64
}

// Failure is one failed sync: when the device failed and when Bridge received
// the report.
type Failure struct {
	DeviceID    string
	FailedAtMS  int64
	ArrivedAtMS int64
}

// Evidence is what a reading rests on. NextStartMS is the first start after
// the failure, LastContactMS the device's last contact recorded by that start,
// and ArrivalStartMS the latest start at or before the arrival. A nil field
// means that fact does not exist.
type Evidence struct {
	FailedAtMS     int64
	ArrivedAtMS    int64
	LastContactMS  *int64
	NextStartMS    *int64
	ArrivalStartMS *int64
}

// Result is one reading and its evidence.
type Result struct {
	Reading  Reading
	Evidence Evidence
}

// Applies reports whether a report gets a reading: only a failed episode
// action at phase sync does.
func Applies(kind, outcome, phase string) bool {
	return kind == telemetry.KindEpisodeAction && outcome == failedOutcome && phase == syncPhase
}

// Read applies the approved rule. starts is every retained start, oldest
// first; a failure older than all of them has no reading, because the start
// that would decide it is gone.
func Read(failure Failure, starts []Start) Result {
	result := Result{Evidence: Evidence{FailedAtMS: failure.FailedAtMS, ArrivedAtMS: failure.ArrivedAtMS}}
	if len(starts) == 0 || failure.FailedAtMS < starts[0].AtMS {
		return result
	}
	evidence := &result.Evidence
	var next *Start
	for i := range starts {
		start := &starts[i]
		if next == nil && start.AtMS > failure.FailedAtMS {
			next = start
		}
		if start.AtMS <= failure.ArrivedAtMS {
			evidence.ArrivalStartMS = &start.AtMS
		}
	}
	if next != nil {
		evidence.NextStartMS = &next.AtMS
		if contact, ok := next.LastContacts[failure.DeviceID]; ok {
			evidence.LastContactMS = &contact
		}
	}
	result.Reading = decide(failure, evidence)
	return result
}

// decide names the reading of a failure that has a start at or before it.
func decide(failure Failure, evidence *Evidence) Reading {
	if evidence.NextStartMS == nil || *evidence.NextStartMS > failure.ArrivedAtMS {
		return RealFailure
	}
	if evidence.LastContactMS != nil && *evidence.LastContactMS >= failure.FailedAtMS {
		return RealFailure
	}
	if failure.ArrivedAtMS-*evidence.ArrivalStartMS <= ArrivalWindow.Milliseconds() {
		return BridgeOff
	}
	return TabletLate
}

// WithCurrentStart adds the running process to the stored starts while its own
// row is not stored yet: the event queue is asynchronous, so a report can
// arrive first. Once the row is stored it stands for this start, because a
// later read sees the same record.
func WithCurrentStart(starts []Start, current Start) []Start {
	if len(starts) > 0 && starts[len(starts)-1].AtMS >= current.AtMS {
		return starts
	}
	return append(slices.Clone(starts), current)
}

// DecodeStart reads one api.listening row. Metadata without a readable record
// (an older row, a truncation marker) leaves LastContacts empty, which is a
// valid start.
func DecodeStart(atMS int64, metadataJSON string) Start {
	var record struct {
		LastContacts map[string]int64 `json:"lastContacts"`
	}
	if json.Unmarshal([]byte(metadataJSON), &record) != nil {
		return Start{AtMS: atMS}
	}
	return Start{AtMS: atMS, LastContacts: record.LastContacts}
}
