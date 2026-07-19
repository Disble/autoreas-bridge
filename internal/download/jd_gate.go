package download

import (
	"context"
	"sync"
)

// jdGate lazily resolves and caches the JDownloader online status exactly once per run
// (concurrency-safe under the per-anime fan-out), so a run where no anime ever discovers a
// missing episode never triggers EnsureOnline's auto-launch side effect. Only code paths that
// have already discovered at least one missing episode may call online(); every other caller
// must use knownOffline(), which never forces resolution.
type jdGate struct {
	resolve   func(ctx context.Context) bool
	onResolve func(online bool)

	once sync.Once
	mu   sync.Mutex

	resolved bool
	value    bool
}

// newJDGate builds a jdGate that resolves via resolve and reports the outcome to onResolve the
// first (and only) time it resolves. onResolve may be nil.
func newJDGate(resolve func(ctx context.Context) bool, onResolve func(online bool)) *jdGate {
	return &jdGate{resolve: resolve, onResolve: onResolve}
}

// online resolves the gate exactly once and returns the cached JDownloader-online status.
// Concurrent callers block until the first resolution completes rather than each triggering
// their own EnsureOnline call. Callers MUST only invoke this after confirming at least one
// missing episode was actually discovered.
func (g *jdGate) online(ctx context.Context) bool {
	g.once.Do(func() {
		online := false
		if g.resolve != nil {
			online = g.resolve(ctx)
		}
		g.mu.Lock()
		g.resolved = true
		g.value = online
		g.mu.Unlock()
		if g.onResolve != nil {
			g.onResolve(online)
		}
	})
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.value
}

// knownOffline reports true ONLY when the gate has already resolved AND resolved to offline. An
// unresolved gate is never treated as offline -- it never triggers a launch just to answer this
// question.
func (g *jdGate) knownOffline() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.resolved && !g.value
}
