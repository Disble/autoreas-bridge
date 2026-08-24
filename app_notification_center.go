package main

import (
	"context"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/notification/center"
)

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
	return contracts.NotificationDetailResult{Found: true, Item: toNotificationDetail(record)}
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

// ArchiveNotifications archives the given ids -- also marking any of them
// still unread as read, in the same store operation (design §5.6).
func (a *App) ArchiveNotifications(ids []int64) contracts.NotificationMutationResult {
	if a.notificationCenterStore == nil {
		return contracts.NotificationMutationResult{Degraded: true}
	}
	ctx := a.notificationCenterCtx()
	affected, err := a.notificationCenterStore.Archive(ctx, ids, a.currentTime().UnixMilli())
	if err != nil {
		return contracts.NotificationMutationResult{Degraded: true}
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
// DTO. ActionCount reflects len(record.Actions): populated for
// GetNotification's single-record read (Store.Record loads the full action
// set) but always 0 for ListNotifications' rows, because Store.List()
// deliberately does not load per-row actions (sqlite_store_list.go, kept a
// lean summary query). Wiring a real per-row action count into the list SQL
// is a follow-up beyond this slice's scope.
func toNotificationRow(record center.Record) contracts.NotificationRow {
	return contracts.NotificationRow{
		ID:            record.ID,
		CreatedAtMs:   record.CreatedAtMS,
		Title:         record.Title,
		Body:          record.Body,
		Level:         record.Level,
		Source:        record.Source,
		CorrelationID: record.CorrelationID,
		ReadAtMs:      record.ReadAtMS,
		ArchivedAtMs:  record.ArchivedAtMS,
		ActionCount:   len(record.Actions),
	}
}

// toNotificationDetail maps a fully-loaded center.Record (Store.Record,
// including its detail rows and actions) into the wire NotificationDetail
// DTO.
func toNotificationDetail(record center.Record) contracts.NotificationDetail {
	rows := make([]contracts.NotificationDetailRow, 0, len(record.Rows))
	for _, row := range record.Rows {
		rows = append(rows, toNotificationDetailRow(row))
	}
	actions := make([]contracts.NotificationAction, 0, len(record.Actions))
	for _, action := range record.Actions {
		actions = append(actions, toNotificationAction(action))
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
func toNotificationAction(action center.Action) contracts.NotificationAction {
	return contracts.NotificationAction{
		ID:            action.ID,
		RowRef:        action.RowRef,
		Label:         action.Label,
		Intent:        action.Intent,
		ExecutedAtMs:  action.ExecutedAtMS,
		RefusedReason: string(action.RefusedReason),
	}
}
