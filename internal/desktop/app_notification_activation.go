package desktop

import (
	"fmt"

	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
)

// wireDesktopActivation routes a Windows toast press back into the SAME executor the detail pane
// presses through.
//
// It is the second door on one gate, never a second gate: ownership (foreign_action), single-fire
// (already_executed) and registration (intent_unregistered) stay decided in exactly one place, so
// a press that arrives from outside the frontend cannot bypass a rule the pane enforces.
//
// Registered once at startup, after the executor exists -- a press arriving before the
// notifications module settles is refused as unavailable and dropped, like any other failure here.
func (a *App) wireDesktopActivation() {
	notification.SetDesktopActivationHandler(a.handleDesktopActivation)
}

// handleDesktopActivation runs one Windows toast press and decides whether the window comes
// forward.
//
// Bridge usually lives hidden in the tray, and Windows leaves that decision to the app: a desktop
// app's toast activation type is ignored, so every press reaches this one callback. The pressed
// intent decides instead -- an open-app intent's outcome is read on screen, a background one's
// is the operation itself.
//
// A press carrying no action id is the toast body rather than one of its buttons. That is a
// request to OPEN the record, which is the frontend's job, so it goes out as the same navigation
// event a "View details" press already uses rather than through the executor, and always on
// screen.
func (a *App) handleDesktopActivation(recordID int64, actionID string) {
	if actionID == "" {
		a.navigateToNotificationRecord(recordID)
		a.openMainWindow()
		return
	}
	result, _ := a.moduleSet().notifications.Use(func(services notificationServices) (center.ExecuteResult, error) {
		return services.executor.Execute(a.notificationCenterCtx(), recordID, actionID), nil
	})
	if result.Activation == center.ActivationOpenApp {
		a.openMainWindow()
	}
}

// navigateToNotificationRecord asks the frontend to open one Center record, through the same
// runtime event a pressed navigation.open token already travels on.
func (a *App) navigateToNotificationRecord(recordID int64) {
	if a.emitFn == nil {
		return
	}
	a.emitFn(a.notificationCenterCtx(), notificationNavigateEventName, fmt.Sprintf("/notifications?recordId=%d", recordID))
}
