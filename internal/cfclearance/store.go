package cfclearance

import "sync"

// MemoryStore keeps clearances in process memory, keyed by registrable domain. It is the v1
// store: the solver engine's own profile persists the cookie across restarts, so a restart
// costs one quick re-solve rather than a database table.
type MemoryStore struct {
	mu       sync.Mutex
	byDomain map[string]Clearance
}

// NewMemoryStore returns an empty MemoryStore.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{byDomain: map[string]Clearance{}}
}

// Load returns the clearance stored for domain, if any.
func (s *MemoryStore) Load(domain string) (Clearance, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.byDomain[domain]
	return c, ok
}

// Save stores c for domain, replacing any previous clearance.
func (s *MemoryStore) Save(domain string, c Clearance) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.byDomain[domain] = c
}

// Delete forgets the clearance stored for domain.
func (s *MemoryStore) Delete(domain string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.byDomain, domain)
}
