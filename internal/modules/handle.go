// Package modules holds the typed module handles (ADR-032 §3): the only way a
// binding reaches a module's services.
//
// A Handle checks the module's readiness in internal/lifecycle before it runs
// the binding's closure. A module still starting answers unavailable (the
// frontend keeps its skeleton and retries); a module that failed answers
// failed_precondition with the reason (the frontend shows the failure). A
// closure error without a code becomes internal, so a failure never renders as
// "no data". These two readiness codes have no exported constructor anywhere:
// readinessError below is unexported, so this package is their only producer.
//
// Creating a module handle (the one supported way):
//
//  1. Declare the services the module's bindings need as a struct in
//     internal/desktop, holding the concrete services, never the App.
//  2. Add one field to the desktop module set, built with
//     NewHandle[ThatStruct](moduleID, registry), where moduleID is the id the
//     composition root already registers.
//  3. At the wiring point, call Bind with the wired services, then mark the
//     module ready with the lifecycle Writer: Bind first, so a binding that sees
//     ready always finds its services.
//  4. Write the binding as `return a.moduleSet().<context>.Use(func(s ThatStruct) (T, error) {...})`;
//     moduleSet builds the module set on first use (internal/desktop/app_readiness.go).
//
// The Shell handle carries only shell capabilities and is always ready.
// The package has no Wails import.
package modules

import (
	"fmt"
	"sync/atomic"

	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
	sharedlogger "autoreas-bridge/internal/logger"
)

// readinessError is the failure a handle produces for a module that cannot serve.
type readinessError struct {
	code    apperr.Code
	message string
}

// Error returns the message the frontend shows.
func (e *readinessError) Error() string { return e.message }

// Code returns unavailable or failed_precondition.
func (e *readinessError) Code() apperr.Code { return e.code }

// Handle gives a binding the services of one module once that module is ready.
type Handle[S any] struct {
	id       lifecycle.ModuleID
	registry *lifecycle.Registry
	services atomic.Pointer[S]
}

// NewHandle builds the handle of module id, reading readiness from registry.
func NewHandle[S any](id lifecycle.ModuleID, registry *lifecycle.Registry) *Handle[S] {
	return &Handle[S]{id: id, registry: registry}
}

// ID returns the module this handle serves.
func (h *Handle[S]) ID() lifecycle.ModuleID { return h.id }

// Bind stores the module's wired services. The composition root calls it before
// it marks the module ready.
func (h *Handle[S]) Bind(services S) { h.services.Store(&services) }

// Use runs fn with the module's services when the module is ready, and returns
// a coded failure otherwise. On any failure the value is T's zero value.
func (h *Handle[S]) Use[T any](fn func(S) (T, error)) (T, error) {
	var zero T
	services, err := h.ready()
	if err != nil {
		return zero, err
	}
	value, err := fn(*services)
	if err != nil {
		return zero, apperr.OrInternal(err)
	}
	return value, nil
}

// ready returns the services, or the failure the module's state calls for.
func (h *Handle[S]) ready() (*S, error) {
	status, ok := h.registry.Status(h.id)
	if !ok {
		return nil, apperr.Internal(fmt.Errorf("%s is not registered", h.id))
	}
	switch status.State {
	case lifecycle.StateStarting:
		return nil, &readinessError{code: apperr.CodeUnavailable, message: fmt.Sprintf("%s is starting", h.id)}
	case lifecycle.StateFailed:
		return nil, &readinessError{code: apperr.CodeFailedPrecondition, message: status.Reason}
	}
	services := h.services.Load()
	if services == nil {
		return nil, apperr.Internal(fmt.Errorf("%s is ready without services", h.id))
	}
	return services, nil
}

// ShellServices are the capabilities of the desktop shell itself: none of them
// belongs to a bounded context, so none of them waits for one.
type ShellServices struct {
	// EffectiveAddress returns the address the HTTP server bound, or "" when none runs.
	EffectiveAddress func() string
	// Logger writes runtime events; frontend error reports go through it.
	Logger sharedlogger.Logger
	// Readiness is the module readiness the shell reports to the frontend.
	Readiness *lifecycle.Registry
}

// Shell is the always-ready handle of the desktop shell.
type Shell struct {
	services ShellServices
}

// NewShell builds the shell handle.
func NewShell(services ShellServices) *Shell {
	return &Shell{services: services}
}

// Use runs fn with the shell services. A closure error without a code becomes
// internal; on failure the value is T's zero value.
func (s *Shell) Use[T any](fn func(ShellServices) (T, error)) (T, error) {
	value, err := fn(s.services)
	if err != nil {
		var zero T
		return zero, apperr.OrInternal(err)
	}
	return value, nil
}
