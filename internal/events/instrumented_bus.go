package events

import (
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
)

// busPublishEventType is the structured-log EventType for every bus publish record.
const busPublishEventType = "bus.publish"

const slowHandlerThreshold = 500 * time.Millisecond

// InstrumentedBus is a decorator around Bus that logs publish events at debug level
// and warns when a handler exceeds the slow-handler threshold (500ms).
type InstrumentedBus struct {
	inner  Bus
	logger sharedlogger.Logger
}

// NewInstrumentedBus wraps an existing Bus with publish logging and slow-handler detection.
func NewInstrumentedBus(inner Bus, logger sharedlogger.Logger) *InstrumentedBus {
	return &InstrumentedBus{inner: inner, logger: logger}
}

// Publish logs the event at debug level, then delegates to the inner bus.
// After each handler runs, it checks for slow execution.
func (b *InstrumentedBus) Publish(event Event) {
	if b.logger != nil {
		b.logger.Logf("bus", sharedlogger.LevelDebug, sharedlogger.Fields{
			EventType: busPublishEventType,
			Metadata:  map[string]any{"eventName": event.Name()},
		}, "publish %s", event.Name())
	}

	start := time.Now()
	b.inner.Publish(event)
	elapsed := time.Since(start)

	if b.logger != nil && elapsed >= slowHandlerThreshold {
		b.logger.Logf("bus", sharedlogger.LevelWarn, sharedlogger.Fields{
			EventType:  busPublishEventType,
			DurationMs: elapsed.Milliseconds(),
			Metadata:   map[string]any{"eventName": event.Name()},
		}, "slow handler chain for %s", event.Name())
	}
}

// Subscribe delegates directly to the inner bus, wrapping the handler to measure per-handler timing.
func (b *InstrumentedBus) Subscribe(eventName string, handler Handler) func() {
	wrappedHandler := func(event Event) {
		start := time.Now()
		handler(event)
		elapsed := time.Since(start)

		if b.logger != nil && elapsed >= slowHandlerThreshold {
			b.logger.Logf("bus", sharedlogger.LevelWarn, sharedlogger.Fields{
				EventType:  busPublishEventType,
				DurationMs: elapsed.Milliseconds(),
				Metadata:   map[string]any{"eventName": eventName},
			}, "slow handler for %s", eventName)
		}
	}
	return b.inner.Subscribe(eventName, wrappedHandler)
}
