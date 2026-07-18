// Package notification provides the project's first SHARED, generic
// user-notification capability (design.md §14, ADR-NOTIF-1/2/3). The Notifier
// port and Notification value type are domain-agnostic: any bounded context
// can be injected with a Notifier and call Notify without the port knowing
// anything about that feature. internal/download is the first consumer;
// SDD-29 migrates the remaining features (sync, anime, device, observability)
// onto this same port with no redesign.
//
// This package is distinct from internal/events.Bus: the bus is the
// backend<->backend domain-event mediator, while Notifier is the user-facing
// sink that turns a notable moment into something a human sees (a toast, an
// OS notification). A backend event is not a user notification.
package notification

import (
	"context"
	"time"
)

// Level constrains a Notification to one of the defined severities.
type Level string

const (
	// LevelInfo marks an informational notification.
	LevelInfo Level = "info"
	// LevelSuccess marks a successful notification.
	LevelSuccess Level = "success"
	// LevelWarning marks a warning notification.
	LevelWarning Level = "warning"
	// LevelError marks an error notification.
	LevelError Level = "error"
)

// Notification is a domain-agnostic value describing a user-notable moment.
// Source is a free-form domain string such as "download", "sync", or "anime"
// -- the type itself MUST NOT reference any specific feature.
type Notification struct {
	Title         string
	Body          string
	Level         Level
	Source        string
	CorrelationID string
	Timestamp     time.Time
}

// Notifier is the shared port any bounded context depends on to surface a
// user-notable moment. Implementations MUST fan out to every registered
// presentation adapter and MUST NOT let one adapter's failure block another
// adapter or propagate as a feature-level failure to the caller.
type Notifier interface {
	Notify(ctx context.Context, n Notification) error
}
