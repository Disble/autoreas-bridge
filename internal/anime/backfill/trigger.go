package backfill

import "autoreas-bridge/internal/logger"

// Trigger starts a pass over scope in the background and returns at once.
//
// One pass runs at a time. A trigger that arrives during a pass queues one repeat, merged with
// any repeat already queued, so a burst of triggers costs at most one more pass. A trigger after
// Stop, or with an empty scope, does nothing.
func (b *Backfill) Trigger(scope Scope) {
	if scope.empty() {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.stopped {
		return
	}
	if b.running {
		merged := scope
		if b.pending != nil {
			merged = b.pending.Merge(scope)
		}
		b.pending = &merged
		return
	}
	b.running = true
	b.idle = make(chan struct{})
	go b.loop(scope, b.idle)
}

// loop runs passes until no repeat is queued or the backfill is stopped, then closes idle.
func (b *Backfill) loop(scope Scope, idle chan struct{}) {
	for {
		b.runRecovered(scope)

		b.mu.Lock()
		if b.pending == nil || b.stopped {
			b.running = false
			b.pending = nil
			b.mu.Unlock()
			close(idle)
			return
		}
		scope = *b.pending
		b.pending = nil
		b.mu.Unlock()
	}
}

// runRecovered runs one background pass. A panic ends that pass only and is logged as an error:
// the pass runs on its own goroutine, where an unrecovered panic would end the whole Bridge
// process, and a missing duration is always better than that.
func (b *Backfill) runRecovered(scope Scope) {
	defer func() {
		if recovered := recover(); recovered != nil {
			b.log(logger.LevelError, "duration backfill pass panicked: %v", recovered)
		}
	}()
	b.Run(b.ctx, scope)
}

// Wait blocks until no pass is running or queued.
func (b *Backfill) Wait() {
	b.mu.Lock()
	idle, running := b.idle, b.running
	b.mu.Unlock()
	if running {
		<-idle
	}
}

// Stop cancels the running pass, drops any queued repeat, refuses later triggers, and waits for
// the pass to end. A probe in flight is cancelled through its context.
func (b *Backfill) Stop() {
	b.mu.Lock()
	b.stopped = true
	b.mu.Unlock()
	b.cancel()
	b.Wait()
}
