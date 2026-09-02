package center

import (
	"context"
	"errors"
)

// ErrTargetMissing is the ONLY error an IntentHandler may return besides nil.
// It maps to RefusalTargetMissing.
var ErrTargetMissing = errors.New("notification center: intent target missing")

// IntentHandler executes one registered operation against frozen args.
//
// Execute MUST return either nil or an error satisfying errors.Is(err,
// ErrTargetMissing). A handler that can fail for any other reason MUST NOT be
// registered: register it conditionally on its subsystem being live, so an
// unwired subsystem surfaces as intent_unregistered rather than an unmodelled
// fifth refusal reason (design Decision C). The Executor defensively maps any
// unrecognised error to RefusalTargetMissing so the closed set cannot leak.
type IntentHandler interface {
	Execute(ctx context.Context, args map[string]string) error
	// Repeatable reports whether a second press may re-invoke this handler.
	// Every intent registered today returns false (single-fire default, D-4.5).
	Repeatable() bool
}

// IntentRegistry resolves an intent key to its bound handler. Declared here
// and filled by the composition root, which is what keeps center from
// importing internal/download and recreating
// notification->download->notification.
type IntentRegistry interface {
	Resolve(intent string) (IntentHandler, bool)
}

// Logger is the narrow logging port center needs, satisfied by
// internal/logger.
type Logger interface {
	Warnf(domain, format string, args ...any)
}
