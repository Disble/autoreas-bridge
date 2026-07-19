package download

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"testing"

	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/jdownloader"
)

// assertSoloRunProgress verifies incremental progress during a single-anime run.
func assertSoloRunProgress(t *testing.T, snapshots []Run) {
	t.Helper()
	if len(snapshots) < 4 {
		t.Fatalf("expected live progress snapshots during solo run, got %d", len(snapshots))
	}
	if snapshots[1].AnimesChecked != 1 {
		t.Fatalf("expected selected anime to be counted before episode completion, got %#v", snapshots[1])
	}
	foundBeforeDone := false
	downloadedOne := false
	downloadedTwo := false
	for _, snapshot := range snapshots {
		if snapshot.EpisodesFound > 0 && snapshot.EpisodesDownloaded < 3 {
			foundBeforeDone = true
		}
		if snapshot.EpisodesDownloaded == 1 {
			downloadedOne = true
		}
		if snapshot.EpisodesDownloaded == 2 {
			downloadedTwo = true
		}
	}
	if !foundBeforeDone {
		t.Fatalf("expected EpisodesFound to advance before all downloads finish, got %#v", snapshots)
	}
	if !downloadedOne || !downloadedTwo {
		t.Fatalf("expected EpisodesDownloaded to advance per episode before final completion, got %#v", snapshots)
	}
}

type catchupCounter struct {
	mu        sync.Mutex
	atRoot    map[string]int
	recursive map[string]int
}

// newCatchupCounter creates an episode counter with root and recursive counts.
func newCatchupCounter(atRoot map[string]int) *catchupCounter {
	recursive := make(map[string]int, len(atRoot))
	for folder, count := range atRoot {
		recursive[folder] = count
	}
	return &catchupCounter{atRoot: atRoot, recursive: recursive}
}

func (c *catchupCounter) CountAtRoot(folder string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.atRoot[folder]
}

func (c *catchupCounter) CountRecursive(folder string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.recursive[folder]
}

func (c *catchupCounter) HighestEpisodeAtRoot(folder string) int { return c.CountAtRoot(folder) }

func (c *catchupCounter) HighestEpisodeRecursive(folder string) int { return c.CountRecursive(folder) }

// setRecursive sets the recursive episode count for a folder.
func (c *catchupCounter) setRecursive(folder string, count int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.recursive[folder] = count
}

// markRecursiveDownloaded records one newly downloaded recursive episode.
func (c *catchupCounter) markRecursiveDownloaded(folder string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.recursive[folder] = c.atRoot[folder] + 1
}

func (c *catchupCounter) Flatten(folder string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.recursive[folder] > c.atRoot[folder] {
		c.atRoot[folder] = c.recursive[folder]
	}
}

var _ filesystem.EpisodeCounter = (*catchupCounter)(nil)

type recordingCatchupJD struct {
	svcFakeJDClient
	counter *catchupCounter
	mu      sync.Mutex
	seen    []int
}

func (j *recordingCatchupJD) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	episode := episodeFromURL(req.URLs[0])
	j.mu.Lock()
	j.seen = append(j.seen, episode)
	j.mu.Unlock()
	j.counter.markRecursiveDownloaded(req.Destination)
	return nil
}

// episodes returns the episode numbers recorded by the fake client.
func (j *recordingCatchupJD) episodes() []int {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := make([]int, len(j.seen))
	copy(out, j.seen)
	return out
}

type neverFinishedCatchupJD struct{ recordingCatchupJD }

func (j *neverFinishedCatchupJD) PackageStatusByDestination(context.Context, string, string) (jdownloader.DestinationStatus, error) {
	return jdownloader.DestinationStatus{}, nil
}

// episodeFromURL extracts the trailing episode number from a URL.
func episodeFromURL(raw string) int {
	parts := strings.Split(strings.TrimRight(raw, "/"), "/")
	n, _ := strconv.Atoi(parts[len(parts)-1])
	return n
}

// equalInts reports whether two integer slices have identical contents.
func equalInts(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
