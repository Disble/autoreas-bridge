package backup

import (
	"context"
	"errors"
	"io"
	"path/filepath"
	"testing"
)

// fakeGroup builds a Group whose exportFn writes body and returns count,
// recording its own name into calls each time it runs.
func fakeGroup(name, body string, count int, calls *[]string) Group {
	return Group{
		Name: name,
		Export: func(_ context.Context, w io.Writer) (int, error) {
			*calls = append(*calls, name)
			if _, err := io.WriteString(w, body); err != nil {
				return 0, err
			}
			return count, nil
		},
	}
}

func TestExportErrorWritesNoManifest(t *testing.T) {
	t.Parallel()

	failingErr := errors.New("boom")
	var calls []string
	groups := []Group{
		fakeGroup("anime_snapshots", `{"a":1}`+"\n", 1, &calls),
		{
			Name: "seasons",
			Export: func(context.Context, io.Writer) (int, error) {
				return 0, failingErr
			},
		},
	}

	dest := filepath.Join(t.TempDir(), "bundle.zip")
	err := Export(context.Background(), dest, "dev", groups)
	if err == nil {
		t.Fatal("expected Export to return an error, got nil")
	}
	if !errors.Is(err, failingErr) {
		t.Fatalf("expected error to wrap the failing group's error, got: %v", err)
	}

	if _, readErr := ReadManifestFile(dest); !errors.Is(readErr, ErrMissingManifest) {
		t.Fatalf("expected ErrMissingManifest after a failed export, got: %v", readErr)
	}
}
