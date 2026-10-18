package desktop

import (
	"context"
	"strconv"

	"autoreas-bridge/internal/observability/incident"
)

// activityPinSourceKind is the incidents.source_kind of a manual pin: a pin
// comes from no recorder fact, and activityread lists pins under All only.
const activityPinSourceKind incident.SourceKind = "pin"

// PinActivityMoment records a "Pin this moment" from the Activity screen as
// one manual_pin incident at the app's clock, so the window around it is kept.
// Unlike the trigger-driven incidents, a failure is returned: the user asked
// for this write and must see it fail.
func (a *App) PinActivityMoment() error {
	if a.bridgeDB == nil {
		return errActivityUnavailable
	}
	now := a.currentTime()
	pinID := "pin-" + strconv.FormatInt(now.UnixNano(), 10)
	ctx, cancel := context.WithTimeout(a.seasonCtx(), incidentRecordBudget)
	defer cancel()
	return incident.NewStore(a.bridgeDB).Record(ctx, incident.Occurrence{
		Trigger: incident.ManualPin(pinID), OccurredAt: now, SourceKind: activityPinSourceKind, SourceID: pinID,
	})
}
