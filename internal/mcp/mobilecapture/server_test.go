package mobilecapture

import "testing"

func TestOpenReaderUsesReadOnlyBridgePath(t *testing.T) {
	t.Parallel()

	path := openToolTestDB(t)
	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer func() { _ = reader.Close() }()
	if got := reader.Path(); got != path {
		t.Fatalf("expected path %q, got %q", path, got)
	}
}
