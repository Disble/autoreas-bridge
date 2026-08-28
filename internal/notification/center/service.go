package center

import (
	"context"
	"errors"
	"time"
	"uuid"

	"autoreas-bridge/internal/notification"
)

// Service decorates a notification.Notifier with durable persistence: every
// Notify call is persisted into the notification center first, then ALWAYS
// delegated to the wrapped Notifier, regardless of the persist outcome.
type Service struct {
	inner notification.Notifier
	store *Store
	log   Logger
	now   func() time.Time
}

// Wrap returns inner unchanged when there is nothing to persist into -- a nil
// inner notifier (so the existing a.notifier == nil guards at
// app_startup_runtime.go:74,222 and app_season_availability.go:325,343 keep
// firing) or a nil store (so tests wiring a bare, unopened &sql.DB{} keep
// observing the exact notifier they injected, and app_startup_test.go:136's
// identity assertion passes unmodified).
//
// Both early returns MUST return the bare value, never a typed nil *Service:
// a (*Service)(nil) returned as a notification.Notifier is NOT == nil, which
// would silently defeat every one of those guards.
func Wrap(inner notification.Notifier, store *Store) notification.Notifier {
	if inner == nil {
		return nil
	}
	if store == nil {
		return inner
	}
	return &Service{inner: inner, store: store, now: time.Now}
}

// Notify persists the record, then ALWAYS delegates to the wrapped Notifier
// -- including when the persist write failed. An early return on persist
// failure is PROHIBITED: five of the six producer families discard Notify's
// error via "_ =", so skipping projection would silently downgrade a
// user-visible toast and Windows desktop notification to nothing,
// invisibly. The returned error carries the persist failure for
// observability only.
func (s *Service) Notify(ctx context.Context, n notification.Notification) error {
	createdAtMS := s.now().UnixMilli()
	if !n.Timestamp.IsZero() {
		createdAtMS = n.Timestamp.UnixMilli()
	}

	rows, actions := toRecordContent(n.Rows, n.Actions)
	recordID, persistErr := s.store.InsertRecord(ctx, Record{
		CreatedAtMS:   createdAtMS,
		Title:         n.Title,
		Body:          n.Body,
		Level:         Level(n.Level),
		Source:        n.Source,
		Kind:          n.Kind,
		CorrelationID: n.CorrelationID,
		Rows:          rows,
		Actions:       actions,
	})
	if persistErr != nil && s.log != nil {
		s.log.Warnf("notification-center", "persist notification record: %v", persistErr)
	}

	dispatchErr := s.dispatch(ctx, n, recordID, actions, persistErr)
	return errors.Join(persistErr, dispatchErr)
}

// dispatch hands the wrapped sink what it can use: the full delivery when the sink offers the
// wider door, and the bare notification when it does not.
//
// The identity is deliberately dropped when the persist failed. InsertRecord returns 0 on every
// error path, and toActions minted its ids before the write was attempted -- so passing them on
// would hand an adapter a button addressing a token that does not exist, which refuses on press
// and looks exactly like the missing button it replaced.
func (s *Service) dispatch(ctx context.Context, n notification.Notification, recordID int64, actions []Action, persistErr error) error {
	deliverer, ok := s.inner.(notification.Deliverer)
	if !ok {
		return s.inner.Notify(ctx, n)
	}

	delivery := notification.Delivery{Notification: n}
	if persistErr == nil {
		delivery.RecordID = recordID
		delivery.ActionIDs = actionIDs(actions)
	}
	return deliverer.Deliver(ctx, delivery)
}

// actionIDs lifts the persisted ids out in the order toActions minted them, which is the order of
// the specs they came from -- toActions walks the specs and stamps each one's index as its
// Ordinal, so index and ordinal are the same number by construction. That is what makes
// Delivery.ActionIDs' parallel-slice invariant hold rather than merely be asserted.
func actionIDs(actions []Action) []string {
	if len(actions) == 0 {
		return nil
	}
	ids := make([]string, 0, len(actions))
	for _, action := range actions {
		ids = append(ids, action.ID)
	}
	return ids
}

// toRecordContent converts a producer's rows and actions TOGETHER, because the two conversions
// are not independent: toActions mints each action's id, and a row-scoped action is only
// reachable from its row through that generated id (DetailRow.ActionIDs, which is what the
// detail pane resolves a row's buttons from). Converting them separately would persist a
// correctly row-bound action that no row can ever address.
func toRecordContent(items []notification.DetailItem, specs []notification.ActionSpec) ([]DetailRow, []Action) {
	rows := toDetailRows(items)
	actions := toActions(specs)
	bindRowActions(rows, actions)
	return rows, actions
}

// bindRowActions fills each row's ActionIDs with the ids of the actions bound to it, matching an
// Action's RowRef against a DetailRow's entity id.
//
// The single guard is what keeps the two levels apart: an action with NO row ref is about the
// whole notification, so it never enters the index at all. That is deliberately the only guard.
// A symmetric one skipping rows with no entity id would be inert -- the empty string can no
// longer be a key here, so nothing can match a collapsed summary row's empty ref -- and a guard
// that cannot change an outcome cannot be proven by any test, which makes it indistinguishable
// from protection that has quietly stopped working.
func bindRowActions(rows []DetailRow, actions []Action) {
	idsByRowRef := make(map[string][]string, len(actions))
	for _, action := range actions {
		if action.RowRef == "" {
			continue
		}
		idsByRowRef[action.RowRef] = append(idsByRowRef[action.RowRef], action.ID)
	}
	for i := range rows {
		if ids, bound := idsByRowRef[rows[i].Ref.ID]; bound {
			rows[i].ActionIDs = ids
		}
	}
}

// toDetailRows converts a producer's neutral notification.DetailItem rows into the store's
// DetailRow shape. A nil/empty input stays nil, so a Notification that attaches nothing persists
// no rows_json (marshalRows' own nil-means-NULL contract).
func toDetailRows(items []notification.DetailItem) []DetailRow {
	if len(items) == 0 {
		return nil
	}
	rows := make([]DetailRow, 0, len(items))
	for _, item := range items {
		rows = append(rows, DetailRow{
			Ref:            EntityRef{Type: item.RefType, ID: item.RefID},
			Name:           item.Name,
			Status:         item.Status,
			Detail:         item.Detail,
			CollapsedCount: item.CollapsedCount,
		})
	}
	return rows
}

// toActions converts a producer's neutral notification.ActionSpec actions into the store's
// Action shape, minting a fresh globally-unique token id for each -- a producer names WHAT an
// action does (Label/Intent/Args), never the id it is addressed by at press time. Ordinal is the
// action's position in the producer's own list, matching the store's ORDER BY ordinal ASC read.
func toActions(specs []notification.ActionSpec) []Action {
	if len(specs) == 0 {
		return nil
	}
	actions := make([]Action, 0, len(specs))
	for ordinal, spec := range specs {
		actions = append(actions, Action{
			ID:      uuid.New().String(),
			Ordinal: ordinal,
			RowRef:  spec.RowRef,
			Label:   spec.Label,
			Intent:  spec.Intent,
			Args:    spec.Args,
		})
	}
	return actions
}

var _ notification.Notifier = (*Service)(nil)
