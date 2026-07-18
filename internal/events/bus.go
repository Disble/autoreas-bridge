package events

import "sync"

// Handler processes an event published on the bus.
type Handler func(Event)

// Bus publishes and subscribes to in-process events.
type Bus interface {
	Publish(Event)
	Subscribe(eventName string, handler Handler) (unsubscribe func())
}

// MemoryBus is an in-memory implementation of Bus.
type MemoryBus struct {
	mu          sync.RWMutex
	nextID      uint64
	subscribers map[string]map[uint64]Handler
}

// NewBus builds an empty in-memory event bus.
func NewBus() *MemoryBus {
	return &MemoryBus{
		subscribers: make(map[string]map[uint64]Handler),
	}
}

// Publish fan-outs an event to every subscriber of its event name.
func (b *MemoryBus) Publish(event Event) {
	b.mu.RLock()
	handlersByID := b.subscribers[event.Name()]
	handlers := make([]Handler, 0, len(handlersByID))
	for _, handler := range handlersByID {
		handlers = append(handlers, handler)
	}
	b.mu.RUnlock()

	for _, handler := range handlers {
		handler(event)
	}
}

// Subscribe registers a handler and returns an unsubscribe function.
func (b *MemoryBus) Subscribe(eventName string, handler Handler) func() {
	b.mu.Lock()
	id := b.nextID
	b.nextID++

	if b.subscribers[eventName] == nil {
		b.subscribers[eventName] = make(map[uint64]Handler)
	}

	b.subscribers[eventName][id] = handler
	b.mu.Unlock()

	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()

		handlersByID := b.subscribers[eventName]
		if handlersByID == nil {
			return
		}

		delete(handlersByID, id)
		if len(handlersByID) == 0 {
			delete(b.subscribers, eventName)
		}
	}
}
