package anime

import (
	"crypto/md5"
	"encoding/hex"
	"sync"
)

type SelfEchoRegistry interface {
	Remember(payload []byte)
	Forget(payload []byte)
	ConsumeIfPresent(payload []byte) bool
	BeginReplacement()
	EndReplacement()
	ReplacementInFlight() bool
}

type md5SelfEchoRegistry struct {
	mu           sync.Mutex
	counts       map[string]int
	replacements int
}

func (r *md5SelfEchoRegistry) BeginReplacement() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.replacements++
}

func (r *md5SelfEchoRegistry) EndReplacement() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.replacements > 0 {
		r.replacements--
	}
}

func (r *md5SelfEchoRegistry) ReplacementInFlight() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.replacements > 0
}

func NewSelfEchoRegistry() SelfEchoRegistry {
	return &md5SelfEchoRegistry{counts: make(map[string]int)}
}

func (r *md5SelfEchoRegistry) Remember(payload []byte) {
	if len(payload) == 0 {
		return
	}

	key := md5Payload(payload)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.counts[key]++
}

func (r *md5SelfEchoRegistry) Forget(payload []byte) {
	if len(payload) == 0 {
		return
	}

	key := md5Payload(payload)
	r.mu.Lock()
	defer r.mu.Unlock()

	count := r.counts[key]
	if count <= 1 {
		delete(r.counts, key)
		return
	}

	r.counts[key] = count - 1
}

func (r *md5SelfEchoRegistry) ConsumeIfPresent(payload []byte) bool {
	if len(payload) == 0 {
		return false
	}

	key := md5Payload(payload)
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

func md5Payload(payload []byte) string {
	sum := md5.Sum(payload)
	return hex.EncodeToString(sum[:])
}
