package sync

import (
	"context"
	"testing"
)

type fakeChangelogStatusReader struct {
	lastID        int64
	lastChangedAt *int64
}

func (f fakeChangelogStatusReader) LastID(context.Context) (int64, error) { return f.lastID, nil }
func (f fakeChangelogStatusReader) LastChangedAt(context.Context) (*int64, error) {
	return f.lastChangedAt, nil
}

func TestStatusServiceReportsSeasonModeFromReader(t *testing.T) {
	t.Parallel()

	svc := NewStatusService(fakeChangelogStatusReader{lastID: 3}, nil, func(context.Context) bool { return true })

	status, err := svc.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus: %v", err)
	}
	if !status.SeasonMode {
		t.Fatalf("expected SeasonMode true, got false")
	}
}

func TestStatusServiceSeasonModeDefaultsFalseWhenReaderNil(t *testing.T) {
	t.Parallel()

	svc := NewStatusService(fakeChangelogStatusReader{}, nil, nil)

	status, err := svc.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus: %v", err)
	}
	if status.SeasonMode {
		t.Fatalf("expected SeasonMode false when reader is nil")
	}
}
