package handlers

import (
	sharedlogger "autoreas-bridge/internal/logger"
)

// websocketLogDomain is the declared domain for every entry these helpers emit.
//
// It is a constant because the incoming-message failure site used to pass its
// whole sentence where `Warnf(domain, format, args...)` expects a domain, so
// the entry landed with a prose domain and a message that was only a device id.
// A domain is a grouping dimension; one prose value in it makes a count grouped
// by domain meaningless, and nothing failed because nothing asserted it.
const websocketLogDomain = "websocket"

// These are the event types the websocket adapter emits. They follow the
// domain.verb shape enforced by TestEmittedEventTypesFollowTheDomainVerbShape.
const (
	websocketRegisterEventType       = "websocket.register"
	websocketRegisterFailedEventType = "websocket.register_failed"
	websocketMessageFailedEventType  = "websocket.message_failed"
)

// logWebSocketClientRegistered records a successful client registration against
// the device it concerns, so the entry is findable by device rather than only
// by free-text search over its message.
func logWebSocketClientRegistered(log sharedlogger.Logger, deviceID string) {
	if log == nil {
		return
	}
	log.Logf(websocketLogDomain, sharedlogger.LevelInfo, sharedlogger.Fields{
		EntityID:  deviceID,
		EventType: websocketRegisterEventType,
	}, "registered websocket client for %s", deviceID)
}

// logWebSocketRegistrationFailed records a failed client registration.
func logWebSocketRegistrationFailed(log sharedlogger.Logger, deviceID string, err error) {
	if log == nil {
		return
	}
	log.Logf(websocketLogDomain, sharedlogger.LevelError, sharedlogger.Fields{
		EntityID:  deviceID,
		EventType: websocketRegisterFailedEventType,
	}, "failed to register websocket client for %s: %v", deviceID, err)
}

// logIncomingWebSocketMessageFailure records a message that could not be
// handled, against the device that sent it.
func logIncomingWebSocketMessageFailure(log sharedlogger.Logger, deviceID string, err error) {
	if log == nil {
		return
	}
	log.Logf(websocketLogDomain, sharedlogger.LevelWarn, sharedlogger.Fields{
		EntityID:  deviceID,
		EventType: websocketMessageFailedEventType,
	}, "websocket incoming message failed for %s: %v", deviceID, err)
}
