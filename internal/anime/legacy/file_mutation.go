package legacy

import (
	"path/filepath"
	"strings"
	"sync"
)

var fileMutationCoordinators sync.Map

// withExclusiveFileMutation serializes mutations targeting the same cleaned path.
func withExclusiveFileMutation(path string, mutate func() error) error {
	key := strings.ToLower(filepath.Clean(path))
	value, _ := fileMutationCoordinators.LoadOrStore(key, &sync.Mutex{})
	mutex := value.(*sync.Mutex)
	mutex.Lock()
	defer mutex.Unlock()
	return mutate()
}

// WithExclusiveFileMutation serializes every bridge-owned mutation of one
// Legacy data file, including append and full-file replacement operations.
func WithExclusiveFileMutation(path string, mutate func() error) error {
	return withExclusiveFileMutation(path, mutate)
}
