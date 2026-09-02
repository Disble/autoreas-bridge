package desktop

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
	"autoreas-bridge/internal/schedule"
)

// notificationActionRunTrigger distinguishes a notification-center-triggered
// re-run from the pre-existing "manual_anime" solo-download trigger
// (app_download.go:358) so both stay independently attributable in run
// history.
const notificationActionRunTrigger = "notification_action"

// notificationArchivedEventName is the Wails runtime event ArchiveNotifications
// emits after a successful archive, carrying the archived ids (design.md §3
// Decision G). Lets a live toast for one of those ids close itself through
// the shared event bus rather than the toast module importing the
// notification-center feature directly.
const notificationArchivedEventName = "notification.archived"

// notificationNavigateEventName is the Wails runtime event the navigation.open
// intent emits, carrying the route frozen into the pressed action's args. It
// follows notificationArchivedEventName's pattern exactly: a backend intent
// that must cause a frontend effect reaches the frontend as a runtime event,
// so the notification center never needs a router and the router never needs
// to know what a notification is.
const notificationNavigateEventName = "notification.navigate"

// missedScheduleSettledEventName is the Wails runtime event a settled
// missed-schedule action emits, carrying the local date that settled.
//
// It is named for the SCHEDULE, not for the notification, because it announces
// what the operation did rather than which carrier fired it. That is the whole
// point of the token pattern: RunMissedScheduleNow tells its caller the answer
// through a return value, a pressed action token has no such channel, and a
// future carrier (tray, deep link) would have none either. One event at the
// operation's own convergence point serves all three, so the Downloads
// read-model converges on the truth no matter who pressed what.
const missedScheduleSettledEventName = "schedule.missed_settled"

// ListNotifications is the Wails-bound keyset-paginated read of the
// notification center's inbox (design §10). Never panics: a nil store or a
// query error degrades to an empty, Degraded page.
func (a *App) ListNotifications(request contracts.NotificationListRequest) contracts.NotificationPage {
	if a.notificationCenterStore == nil {
		return contracts.NotificationPage{Items: []contracts.NotificationRow{}, Degraded: true}
	}
	ctx := a.notificationCenterCtx()

	page, err := a.notificationCenterStore.List(ctx, toListQuery(request))
	if err != nil {
		return contracts.NotificationPage{Items: []contracts.NotificationRow{}, Degraded: true}
	}
	totalEver, err := a.notificationCenterStore.TotalEverRecorded(ctx)
	if err != nil {
		return contracts.NotificationPage{Items: []contracts.NotificationRow{}, Degraded: true}
	}
	return toNotificationPage(page, totalEver)
}

// GetNotification is the Wails-bound single-record detail read.
// Found=false with Degraded=false means "no such id"; Degraded=true means
// the store itself is unavailable or the query failed.
func (a *App) GetNotification(id int64) contracts.NotificationDetailResult {
	if a.notificationCenterStore == nil {
		return contracts.NotificationDetailResult{Degraded: true}
	}
	record, found, err := a.notificationCenterStore.Record(a.notificationCenterCtx(), id)
	if err != nil {
		return contracts.NotificationDetailResult{Degraded: true}
	}
	if !found {
		return contracts.NotificationDetailResult{}
	}
	return contracts.NotificationDetailResult{Found: true, Item: toNotificationDetail(record, a.isRepeatableIntent)}
}

// GetUnreadNotificationCount is the Wails-bound read the nav rail badge
// polls. Degrades to 0 when the store is unavailable or the query fails.
func (a *App) GetUnreadNotificationCount() int {
	if a.notificationCenterStore == nil {
		return 0
	}
	count, err := a.notificationCenterStore.UnreadCount(a.notificationCenterCtx())
	if err != nil {
		return 0
	}
	return count
}

// MarkNotificationsRead marks the given ids read. Returns how many were
// actually transitioned plus the fresh unread count, so the rail badge can
// update without a second round trip.
func (a *App) MarkNotificationsRead(ids []int64) contracts.NotificationMutationResult {
	if a.notificationCenterStore == nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	ctx := a.notificationCenterCtx()
	affected, err := a.notificationCenterStore.MarkRead(ctx, ids, a.currentTime().UnixMilli())
	if err != nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	return a.notificationMutationResult(ctx, affected)
}

// MarkNotificationsUnread puts the given ids back to unread, the reverse of
// MarkNotificationsRead (design-canvas Lifecycle.dc.html -- read is
// "Reversible -- 'mark unread' puts it back"). It returns the same envelope
// every lifecycle mutation does, so the fresh UnreadCount the rail badge
// consumes climbs in the same round trip.
//
// It emits no event, unlike ArchiveNotifications: archiving has to reach the
// toast layer because it closes a live toast, while a read-state flip changes
// nothing any other surface is showing.
func (a *App) MarkNotificationsUnread(ids []int64) contracts.NotificationMutationResult {
	if a.notificationCenterStore == nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	ctx := a.notificationCenterCtx()
	affected, err := a.notificationCenterStore.MarkUnread(ctx, ids)
	if err != nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	return a.notificationMutationResult(ctx, affected)
}

// ArchiveNotifications archives the given ids -- also marking any of them
// still unread as read, in the same store operation (design §5.6). On
// success it also emits notificationArchivedEventName carrying ids, so a
// live toast for one of them can close itself (design §3 Decision G).
func (a *App) ArchiveNotifications(ids []int64) contracts.NotificationMutationResult {
	if a.notificationCenterStore == nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	ctx := a.notificationCenterCtx()
	affected, err := a.notificationCenterStore.Archive(ctx, ids, a.currentTime().UnixMilli())
	if err != nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	if a.emitFn != nil {
		a.emitFn(ctx, notificationArchivedEventName, ids)
	}
	return a.notificationMutationResult(ctx, affected)
}

// RestoreNotifications restores the given ids from the archived view.
// Deliberately does NOT mark them unread again (design §5.6 -- "you already
// saw it").
func (a *App) RestoreNotifications(ids []int64) contracts.NotificationMutationResult {
	if a.notificationCenterStore == nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	ctx := a.notificationCenterCtx()
	affected, err := a.notificationCenterStore.Restore(ctx, ids)
	if err != nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	return a.notificationMutationResult(ctx, affected)
}

// notificationMutationResult builds the shared mutation-result envelope,
// overlaying a fresh UnreadCount read after the mutation committed.
func (a *App) notificationMutationResult(ctx context.Context, affected int) contracts.NotificationMutationResult {
	unread, err := a.notificationCenterStore.UnreadCount(ctx)
	if err != nil {
		return contracts.NotificationMutationResult{Affected: affected, Degraded: true}
	}
	return contracts.NotificationMutationResult{Affected: affected, UnreadCount: unread}
}

// notificationCenterCtx returns a.ctx, falling back to context.Background()
// before startup has set it (mirrors downloadCtx/seasonCtx).
func (a *App) notificationCenterCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}

// toListQuery maps a NotificationListRequest into the store's ListQuery.
// Search, Sources, and Levels are forwarded as-is (Slice 3b): the store's
// buildListQuery now honors all three, ANDed together ahead of the keyset
// cursor predicate (internal/notification/center/sqlite_store_list.go).
func toListQuery(request contracts.NotificationListRequest) center.ListQuery {
	view := center.ViewActive
	if request.View == string(center.ViewArchived) {
		view = center.ViewArchived
	}
	return center.ListQuery{
		View:       view,
		UnreadOnly: request.UnreadOnly,
		Search:     request.Search,
		Sources:    request.Sources,
		Levels:     request.Levels,
		Cursor:     request.Cursor,
		Limit:      request.Limit,
	}
}

// toNotificationPage maps a store Page plus the separately-read TotalEver
// into the wire NotificationPage DTO.
func toNotificationPage(page center.Page, totalEver int) contracts.NotificationPage {
	items := make([]contracts.NotificationRow, 0, len(page.Items))
	for _, record := range page.Items {
		items = append(items, toNotificationRow(record))
	}
	return contracts.NotificationPage{
		Items:        items,
		NextCursor:   page.NextCursor,
		AppliedLimit: page.Limit,
		TotalEver:    totalEver,
	}
}

// toNotificationRow maps a center.Record into the shared list/detail row
// DTO, including the bounded projection the master list renders: a real
// action count, how many things the record is about, and the first few of
// their names. ActionCount comes from record.ActionCount, never
// len(record.Actions): the list read deliberately loads no action bodies, so
// that slice is legitimately empty there while the count is not.
func toNotificationRow(record center.Record) contracts.NotificationRow {
	return contracts.NotificationRow{
		ID:            record.ID,
		CreatedAtMs:   record.CreatedAtMS,
		Title:         record.Title,
		Body:          record.Body,
		Level:         record.Level,
		Source:        record.Source,
		Kind:          record.Kind,
		CorrelationID: record.CorrelationID,
		ReadAtMs:      record.ReadAtMS,
		ArchivedAtMs:  record.ArchivedAtMS,
		ActionCount:   record.ActionCount,
		RowCount:      countNotificationSubjects(record.Rows),
		Subjects:      notificationSubjects(record.Rows),
	}
}

// toNotificationDetail maps a fully-loaded center.Record (Store.Record,
// including its detail rows and actions) into the wire NotificationDetail
// DTO. isRepeatable answers each action's repeatability against the live
// registry -- see toNotificationAction.
func toNotificationDetail(record center.Record, isRepeatable func(intent string) bool) contracts.NotificationDetail {
	rows := make([]contracts.NotificationDetailRow, 0, len(record.Rows))
	for _, row := range record.Rows {
		rows = append(rows, toNotificationDetailRow(row))
	}
	actions := make([]contracts.NotificationAction, 0, len(record.Actions))
	for _, action := range record.Actions {
		actions = append(actions, toNotificationAction(action, isRepeatable))
	}
	return contracts.NotificationDetail{
		NotificationRow: toNotificationRow(record),
		Rows:            rows,
		Actions:         actions,
	}
}

// toNotificationDetailRow maps one center.DetailRow into its wire shape.
func toNotificationDetailRow(row center.DetailRow) contracts.NotificationDetailRow {
	return contracts.NotificationDetailRow{
		RefType:        row.Ref.Type,
		RefID:          row.Ref.ID,
		Name:           row.Name,
		Status:         row.Status,
		Detail:         row.Detail,
		ActionIDs:      row.ActionIDs,
		CollapsedCount: row.CollapsedCount,
	}
}

// toNotificationAction maps one center.Action into its wire shape. Args are
// deliberately NOT included -- the frontend presses a token by id and never
// sees, and therefore can never propose, the frozen arguments.
//
// Repeatable is resolved here rather than read off the token because it is a
// property of the handler wired TODAY, not of the record frozen last week: an
// intent whose subsystem is unwired resolves to nothing, and must not reach
// the pane promising a second press that cannot happen.
func toNotificationAction(action center.Action, isRepeatable func(intent string) bool) contracts.NotificationAction {
	return contracts.NotificationAction{
		ID:            action.ID,
		RowRef:        action.RowRef,
		Label:         action.Label,
		Intent:        action.Intent,
		ExecutedAtMs:  action.ExecutedAtMS,
		RefusedReason: string(action.RefusedReason),
		Repeatable:    isRepeatable(action.Intent),
	}
}

// registerNotificationIntents builds the StaticRegistry every action token
// resolves through at press time. Registration is conditional on purpose
// (design Decision C): an unwired subsystem surfaces as intent_unregistered
// rather than an unmodelled fifth refusal reason -- which is why
// navigation.open is gated on a.emitFn, the only channel it has to reach the
// frontend with. download.retry_run is deliberately never registered -- it
// does not exist (internal/download/service.go exposes only RunOnce and
// RunAnime).
//
// navigation.open is repeatable for the same reason clipboard.copy is: a press
// leaves nothing behind to spend. Registered single-fire it was spent by its
// own first press and refused already_executed forever after, which made an
// "Open Downloads" button a one-shot on a record the user may open many times.
func (a *App) registerNotificationIntents() *center.StaticRegistry {
	registry := center.NewStaticRegistry()

	if a.downloadService != nil {
		registry.Register(center.IntentDownloadRunAnime, center.SingleFireFunc(a.runAnimeAgainIntent))
	}
	if a.emitFn != nil {
		registry.Register(center.IntentNavigationOpen, center.RepeatableFunc(a.navigationOpenIntent))
	}
	if a.copyText != nil {
		registry.Register(center.IntentClipboardCopy, center.RepeatableFunc(a.clipboardCopyIntent))
	}
	if a.seasonService != nil {
		registry.Register(center.IntentSeasonDownloadNow, center.SingleFireFunc(a.seasonDownloadNowIntent))
	}
	if a.downloadScheduler != nil {
		registry.Register(center.IntentScheduleRunMissedNow, center.SingleFireFunc(func(ctx context.Context, args map[string]string) error {
			return missedStartupActionAsIntentError(a.resolveMissedStartupAction(ctx, args["localDate"], schedule.MissedStartupActionRunNow))
		}))
		registry.Register(center.IntentScheduleIgnoreMissed, center.SingleFireFunc(func(ctx context.Context, args map[string]string) error {
			return missedStartupActionAsIntentError(a.resolveMissedStartupAction(ctx, args["localDate"], schedule.MissedStartupActionIgnore))
		}))
	}
	return registry
}

// resolveMissedStartupAction is the single production call-site both
// RunMissedScheduleNow/IgnoreMissedSchedule (app_download.go) and their
// registered notification-action intents above invoke, so both carriers
// converge on one operation rather than becoming two independent code
// paths for the same action (notification-actions spec, "Existing Wails
// Bindings Become Carriers Of Registered Intents").
//
// A settlement announces itself here rather than in the intent closures, so
// every carrier of this operation -- present and future -- refreshes the
// frontend's schedule read-model, not just the one that happened to need it
// first. The emit is best-effort and deliberately NOT a registration
// condition: unlike navigation.open, whose entire job is the emit, these two
// intents still settle the day with no runtime attached.
//
// Only a settlement is announced. The event reports what the operation DID,
// so a refused, racing or unavailable press stays silent -- which also means a
// screen already stale before the press stays stale until its next ordinary
// refresh.
func (a *App) resolveMissedStartupAction(ctx context.Context, localDate string, action schedule.MissedStartupAction) schedule.MissedStartupActionResult {
	result := a.downloadScheduler.ResolveMissedStartupDate(ctx, localDate, action)
	if result.Kind == schedule.MissedStartupActionSettled && a.emitFn != nil {
		a.emitFn(ctx, missedScheduleSettledEventName, result.LocalDate)
	}
	return result
}

// missedStartupActionAsIntentError maps a scheduler missed-startup result
// into the IntentHandler error contract: nil on a settled action, a generic
// error otherwise. Decision C's defense in depth (center.Executor) maps any
// non-nil error into RefusalTargetMissing, so an in-progress/unavailable/
// unresolved outcome surfaces as "target_missing" rather than inventing a
// fifth refusal reason for a rare press-time race.
func missedStartupActionAsIntentError(result schedule.MissedStartupActionResult) error {
	if result.Kind == schedule.MissedStartupActionSettled {
		return nil
	}
	return fmt.Errorf("missed startup action not settled: %s", result.Kind)
}

// seasonDownloadNowIntent is the season.download_now handler: it runs the same manual season
// download the Daily Board's own "Download now" button triggers.
//
// It reports no error because the operation it wraps reports none -- triggerDownloadsForSeason
// hands the work to the download orchestration and returns. That is the whole reason the intent
// is registered conditionally on the season subsystem being live: an unwired subsystem must
// surface as intent_unregistered, never as a handler that cannot say what went wrong (design
// Decision C, IntentHandler's error contract).
func (a *App) seasonDownloadNowIntent(ctx context.Context, _ map[string]string) error {
	a.triggerDownloadsForSeason(ctx)
	return nil
}

// runAnimeAgainIntent is the download.run_anime handler: it re-resolves the
// anime fresh at press time via GetAnimeDetail (app_runtime.go:147) rather
// than trusting a frozen snapshot -- GetAnimeDetail returning nil is exactly
// how a deleted target is detected, potentially days after the record was
// created.
func (a *App) runAnimeAgainIntent(ctx context.Context, args map[string]string) error {
	anime := a.GetAnimeDetail(args[center.ArgKeyAnimeID])
	if anime == nil {
		return center.ErrTargetMissing
	}
	_, err := a.downloadService.RunAnime(ctx, notificationActionRunTrigger, *anime)
	return err
}

// navigationOpenIntent is the navigation.open handler: it forwards the route
// frozen into the action's args to the frontend as a runtime event, the same
// way ArchiveNotifications reaches the toast layer. A token whose route is
// missing has nothing to point at, so it maps onto the closed refusal set as
// target_missing rather than emitting a navigation to nowhere.
func (a *App) navigationOpenIntent(ctx context.Context, args map[string]string) error {
	route := args[center.ArgKeyRoute]
	if route == "" {
		return center.ErrTargetMissing
	}
	a.emitFn(ctx, notificationNavigateEventName, route)
	return nil
}

// wireNotificationCenterIntentExecutor constructs a.notificationCenterExecutor
// once the subsystems its intents close over exist -- called from startup
// AFTER startDownloadOrchestration, never before, since a.downloadService
// and a.downloadScheduler are only assigned there (design §5.8). A nil
// notificationCenterStore (bridge DB unusable) leaves the executor nil;
// ExecuteNotificationAction degrades that to the same intent_unregistered
// outcome an empty registry already produces.
func (a *App) wireNotificationCenterIntentExecutor() {
	if a.notificationCenterStore == nil {
		return
	}
	a.notificationCenterIntents = a.registerNotificationIntents()
	a.notificationCenterExecutor = center.NewExecutor(a.notificationCenterStore, a.notificationCenterIntents)
	a.wireDesktopActivation()
}

// wireDesktopActivation routes a Windows toast press back into the SAME executor the detail pane
// presses through.
//
// It is the second door on one gate, never a second gate: ownership (foreign_action), single-fire
// (already_executed) and registration (intent_unregistered) stay decided in exactly one place, so
// a press that arrives from outside the frontend cannot bypass a rule the pane enforces.
//
// A press carrying no action id is the toast body rather than one of its buttons. That is a
// request to OPEN the record, which is the frontend's job, so it goes out as the same navigation
// event a "View details" press already uses rather than through the executor.
//
// Registered once at startup, after the executor exists -- a press arriving before then finds a
// nil executor and degrades to the same intent_unregistered refusal an empty registry produces.
func (a *App) wireDesktopActivation() {
	notification.SetDesktopActivationHandler(func(recordID int64, actionID string) {
		if actionID == "" {
			a.navigateToNotificationRecord(recordID)
			return
		}
		_ = a.ExecuteNotificationAction(recordID, actionID)
	})
}

// navigateToNotificationRecord asks the frontend to open one Center record, through the same
// runtime event a pressed navigation.open token already travels on.
func (a *App) navigateToNotificationRecord(recordID int64) {
	if a.emitFn == nil {
		return
	}
	a.emitFn(a.notificationCenterCtx(), notificationNavigateEventName, fmt.Sprintf("/notifications?recordId=%d", recordID))
}

// isRepeatableIntent reports whether the handler registered under intent
// declares a second press meaningful. An intent nobody registered is single-
// fire by construction: nothing is there to ask, and the press it would offer
// refuses with intent_unregistered anyway. A nil registry (GetNotification
// called before wireNotificationCenterIntentExecutor ran) degrades to the
// same answer rather than panicking, exactly as the nil-executor path does.
func (a *App) isRepeatableIntent(intent string) bool {
	if a.notificationCenterIntents == nil {
		return false
	}
	handler, registered := a.notificationCenterIntents.Resolve(intent)
	return registered && handler.Repeatable()
}

// ExecuteNotificationAction is the Wails-bound press-time entry point
// (design §5.8/§5.7). A nil executor (store unavailable, or called before
// wireNotificationCenterIntentExecutor ran) degrades to the same
// intent_unregistered outcome an empty IntentResolver already produces.
func (a *App) ExecuteNotificationAction(notificationID int64, actionID string) contracts.NotificationActionResult {
	if a.notificationCenterExecutor == nil {
		return contracts.NotificationActionResult{Reason: string(center.RefusalIntentUnregistered)}
	}
	result := a.notificationCenterExecutor.Execute(a.notificationCenterCtx(), notificationID, actionID)
	return contracts.NotificationActionResult{
		Executed:     result.Executed,
		Reason:       string(result.Reason),
		Message:      result.Message,
		ExecutedAtMs: result.ExecutedAtMS,
	}
}
