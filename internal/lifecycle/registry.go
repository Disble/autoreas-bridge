// Package lifecycle holds the readiness of every Bridge module (ADR-032 §1).
//
// A module is a bounded context as the desktop shell sees it. It is starting
// until the composition root wires its services, then ready, or failed with a
// reason when its wiring did not happen. The package has no Wails import:
// internal/desktop forwards each transition to the frontend.
//
// New returns two values on purpose. The Registry answers reads and is handed to
// the module handles; the Writer changes state and stays in the composition root.
// Domains never import this package.
package lifecycle

import (
	"errors"
	"fmt"
	"sync"

	"autoreas-bridge/internal/events"
)

// State is one point of a module's lifecycle.
type State string

const (
	// StateStarting means the module is registered and its services are not wired yet.
	StateStarting State = "starting"
	// StateReady means the module's services are wired and its bindings may run.
	StateReady State = "ready"
	// StateFailed means the module's services will not be wired in this process.
	StateFailed State = "failed"
)

// ModuleID names one module, after its bounded context.
type ModuleID string

// EventNameReadinessChanged identifies a module readiness transition on the bus.
// The desktop adapter forwards it to the frontend under the same name.
const EventNameReadinessChanged = "bridge.readiness"

// ErrUnknownModule reports a transition for a module that was never registered.
var ErrUnknownModule = errors.New("lifecycle: unknown module")

// ErrInvalidTransition reports a transition out of a terminal state (ready or failed).
var ErrInvalidTransition = errors.New("lifecycle: invalid transition")

// Status is the readiness of one module. Reason is set only when State is StateFailed.
type Status struct {
	Module ModuleID
	State  State
	Reason string
}

// ReadinessChangedEvent is published on the bus for every transition, including
// the registration that puts a module in StateStarting.
type ReadinessChangedEvent struct {
	Status
}

// Name identifies the event on the bus.
func (ReadinessChangedEvent) Name() string { return EventNameReadinessChanged }

// Registry is the read side: safe for concurrent use by binding goroutines.
type Registry struct {
	mu       sync.RWMutex
	order    []ModuleID
	statuses map[ModuleID]Status
}

// Writer is the only API that changes readiness. The composition root keeps it.
//
// Its transitions are serialized, and each one is published after the state is
// stored, so a subscriber that reads the Registry sees the state it was told
// about. A bus handler must not call the Writer: the call would deadlock.
type Writer struct {
	mu       sync.Mutex
	registry *Registry
	bus      events.Bus
}

// New builds an empty registry and its writer. A nil bus stores transitions
// without publishing them.
func New(bus events.Bus) (*Registry, *Writer) {
	registry := &Registry{statuses: map[ModuleID]Status{}}
	return registry, &Writer{registry: registry, bus: bus}
}

// Status returns the readiness of one module, and false when it is not registered.
func (r *Registry) Status(id ModuleID) (Status, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	status, ok := r.statuses[id]
	return status, ok
}

// Snapshot returns every registered module in registration order.
func (r *Registry) Snapshot() []Status {
	r.mu.RLock()
	defer r.mu.RUnlock()
	snapshot := make([]Status, 0, len(r.order))
	for _, id := range r.order {
		snapshot = append(snapshot, r.statuses[id])
	}
	return snapshot
}

// Register adds each module that is not registered yet in StateStarting.
// A module already registered keeps its state, so registering twice is safe.
func (w *Writer) Register(ids ...ModuleID) {
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, id := range ids {
		if _, ok := w.registry.Status(id); ok {
			continue
		}
		w.store(Status{Module: id, State: StateStarting}, true)
	}
}

// MarkReady moves a starting module to StateReady.
func (w *Writer) MarkReady(id ModuleID) error {
	return w.transition(Status{Module: id, State: StateReady})
}

// MarkFailed moves a starting module to StateFailed with the reason the
// frontend shows.
func (w *Writer) MarkFailed(id ModuleID, reason string) error {
	return w.transition(Status{Module: id, State: StateFailed, Reason: reason})
}

// FailStarting moves every module still in StateStarting to StateFailed with
// one reason. A startup step that returns early calls it, so no module stays
// starting forever. It returns the modules it failed, in registration order.
func (w *Writer) FailStarting(reason string) []ModuleID {
	w.mu.Lock()
	defer w.mu.Unlock()
	var failed []ModuleID
	for _, status := range w.registry.Snapshot() {
		if status.State == StateStarting {
			w.store(Status{Module: status.Module, State: StateFailed, Reason: reason}, false)
			failed = append(failed, status.Module)
		}
	}
	return failed
}

// transition applies one move out of StateStarting.
func (w *Writer) transition(next Status) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	current, ok := w.registry.Status(next.Module)
	if !ok {
		return fmt.Errorf("%w: %s", ErrUnknownModule, next.Module)
	}
	if current.State != StateStarting {
		return fmt.Errorf("%w: %s is %s", ErrInvalidTransition, next.Module, current.State)
	}
	w.store(next, false)
	return nil
}

// store saves status, then publishes it. added appends a new module to the order.
func (w *Writer) store(status Status, added bool) {
	w.registry.mu.Lock()
	if added {
		w.registry.order = append(w.registry.order, status.Module)
	}
	w.registry.statuses[status.Module] = status
	w.registry.mu.Unlock()
	if w.bus != nil {
		w.bus.Publish(ReadinessChangedEvent{Status: status})
	}
}
