package center

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/notification"

	"github.com/google/uuid"
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

	_, persistErr := s.store.InsertRecord(ctx, Record{
		CreatedAtMS:   createdAtMS,
		Title:         n.Title,
		Body:          n.Body,
		Level:         Level(n.Level),
		Source:        n.Source,
		CorrelationID: n.CorrelationID,
		Rows:          toDetailRows(n.Rows),
		Actions:       toActions(n.Actions),
	})
	if persistErr != nil && s.log != nil {
		s.log.Warnf("notification-center", "persist notification record: %v", persistErr)
	}

	dispatchErr := s.inner.Notify(ctx, n)
	return errors.Join(persistErr, dispatchErr)
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
			ID:      uuid.NewString(),
			Ordinal: ordinal,
			Label:   spec.Label,
			Intent:  spec.Intent,
			Args:    spec.Args,
		})
	}
	return actions
}

var _ notification.Notifier = (*Service)(nil)
