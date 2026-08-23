package center

import (
	"context"
	"errors"
	"time"

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

	_, persistErr := s.store.InsertRecord(ctx, Record{
		CreatedAtMS:   createdAtMS,
		Title:         n.Title,
		Body:          n.Body,
		Level:         Level(n.Level),
		Source:        n.Source,
		CorrelationID: n.CorrelationID,
	})
	if persistErr != nil && s.log != nil {
		s.log.Warnf("notification-center", "persist notification record: %v", persistErr)
	}

	dispatchErr := s.inner.Notify(ctx, n)
	return errors.Join(persistErr, dispatchErr)
}

var _ notification.Notifier = (*Service)(nil)
