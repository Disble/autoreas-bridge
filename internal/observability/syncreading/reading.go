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
	// GracePeriod is the second of a failure's three periods: from N, the
	// first start after the failure, Bridge is on and the tablet has not had
	// its first retry yet. It is mobile's longest normal retry: its
	// WorkManager floor of 15 minutes, measured at up to 20m11s on the
	// device. A first report after it is overdue. Set by the owner on
	// 2026-11-07.
	GracePeriod = 20 * time.Minute

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

// Evidence is what a reading rests on, as the three periods of a failure:
//   - Bridge off: from FailedAtMS (T) to NextStartMS (N), the first start
//     after the failure. LastContactMS is the device's last contact that start
//     recorded.
//   - Grace period: from N to GraceUntilMS, N plus GracePeriod.
//   - Overdue: after GraceUntilMS with no report from the device.
//
// FirstReportMS (F) is the device's first report received at or after N;
// OverdueMS is how long after the grace period F came, set only for a late
// tablet. A nil field means that fact does not exist or did not decide the
// reading.
type Evidence struct {
	FailedAtMS    int64
	ArrivedAtMS   int64
	LastContactMS *int64
	NextStartMS   *int64
	GraceUntilMS  *int64
	FirstReportMS *int64
	OverdueMS     *int64
}

// FirstReport answers when a device's first report of any kind was received
// at or after fromMS. ok is false when none is known. Read asks it once per
// failure, and only when the answer decides the reading.
type FirstReport func(deviceID string, fromMS int64) (atMS int64, ok bool)

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
// that would decide it is gone. The reading follows from where F, the device's
// first report at or after N, falls: inside the grace period, Bridge was off;
// after it, the tablet came back late. firstReport finds F. The failure's own
// report is one, received at R, so F is never later than R, whatever the lookup
// answers. Measuring F and not R keeps a backlog together: mobile sends 3
// reports per cycle, so the later reports of a healthy tablet arrive later.
func Read(failure Failure, starts []Start, firstReport FirstReport) Result {
	result := Result{Evidence: Evidence{FailedAtMS: failure.FailedAtMS, ArrivedAtMS: failure.ArrivedAtMS}}
	if len(starts) == 0 || failure.FailedAtMS < starts[0].AtMS {
		return result
	}
	result.Reading = RealFailure
	evidence := &result.Evidence
	// The oldest start is at or before the failure, so N is a later one.
	later := starts[1:]
	i := slices.IndexFunc(later, func(s Start) bool { return s.AtMS > failure.FailedAtMS })
	if i < 0 {
		return result
	}
	next := &later[i]
	evidence.NextStartMS = &next.AtMS
	if contact, ok := next.LastContacts[failure.DeviceID]; ok {
		evidence.LastContactMS = &contact
		if contact >= failure.FailedAtMS {
			return result
		}
	}
	if next.AtMS > failure.ArrivedAtMS {
		return result
	}
	first := failure.ArrivedAtMS
	if atMS, ok := firstReport(failure.DeviceID, next.AtMS); ok {
		first = min(first, atMS)
	}
	graceUntil := next.AtMS + GracePeriod.Milliseconds()
	evidence.GraceUntilMS, evidence.FirstReportMS = &graceUntil, &first
	if first <= graceUntil {
		result.Reading = BridgeOff
		return result
	}
	overdue := first - graceUntil
	evidence.OverdueMS = &overdue
	result.Reading = TabletLate
	return result
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
