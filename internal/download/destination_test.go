package download

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveDestinationUsesExplicitFolderWithoutFilesystemAccess(t *testing.T) {
	folder := filepath.Join(t.TempDir(), "not-created")
	got := ResolveDestination(&folder, filepath.Join(t.TempDir(), "root"), "Ignored")
	if got != folder {
		t.Fatalf("explicit destination = %q, want %q", got, folder)
	}
	if _, err := os.Stat(folder); !os.IsNotExist(err) {
		t.Fatalf("test destination unexpectedly exists: %v", err)
	}
}

func TestResolveDestinationDerivesSanitizedNameFromRoot(t *testing.T) {
	root := filepath.Join("D:", "Downloads")
	got := ResolveDestination(nil, root, "Re:Zero")
	want := filepath.Join(root, "Re Zero")
	if got != want {
		t.Fatalf("derived destination = %q, want %q", got, want)
	}
}

func TestResolveDestinationReturnsEmptyWhenNoDeterministicPathExists(t *testing.T) {
	if got := ResolveDestination(nil, "", `:/\|`); got != "" {
		t.Fatalf("unresolved destination = %q, want empty", got)
	}
}
