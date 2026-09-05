package anime

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
)

// SelfEchoRegistry tracks payload hashes emitted by the writer so the watcher
// can suppress its own filesystem echoes.
type SelfEchoRegistry interface {
	Remember(payload []byte)
	Forget(payload []byte)
	ConsumeIfPresent(payload []byte) bool
	BeginReplacement()
	EndReplacement()
	ReplacementInFlight() bool
}

type selfEchoRegistry struct {
	mu           sync.Mutex
	counts       map[string]int
	replacements int
}

func (r *selfEchoRegistry) BeginReplacement() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.replacements++
}

func (r *selfEchoRegistry) EndReplacement() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.replacements > 0 {
		r.replacements--
	}
}

func (r *selfEchoRegistry) ReplacementInFlight() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.replacements > 0
}

// NewSelfEchoRegistry builds the default hash-based self-echo registry.
func NewSelfEchoRegistry() SelfEchoRegistry {
	return &selfEchoRegistry{counts: make(map[string]int)}
}

func (r *selfEchoRegistry) Remember(payload []byte) {
	if len(payload) == 0 {
		return
	}

	key := payloadFingerprint(payload)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.counts[key]++
}

func (r *selfEchoRegistry) Forget(payload []byte) {
	if len(payload) == 0 {
		return
	}

	key := payloadFingerprint(payload)
	r.mu.Lock()
	defer r.mu.Unlock()

	count := r.counts[key]
	if count <= 1 {
		delete(r.counts, key)
		return
	}

	r.counts[key] = count - 1
}

func (r *selfEchoRegistry) ConsumeIfPresent(payload []byte) bool {
	if len(payload) == 0 {
		return false
	}

	key := payloadFingerprint(payload)
	r.mu.Lock()
	defer r.mu.Unlock()

	count := r.counts[key]
	if count == 0 {
		return false
	}

	if count == 1 {
		delete(r.counts, key)
	} else {
		r.counts[key] = count - 1
	}

	return true
}

// payloadFingerprint returns the digest used to recognise a payload the writer
// just emitted. It is an in-memory dedupe key: never persisted, never sent, and
// never compared against anything a caller supplies.
func payloadFingerprint(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}
