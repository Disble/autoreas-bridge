package desktop

import (
	"embed"
	"testing"
)

func TestBuildAppOptionsLocksToASingleInstance(t *testing.T) {
	t.Parallel()

	appOptions := buildAppOptions(NewApp(), embed.FS{})

	if !appOptions.StartHidden {
		t.Fatal("expected app options to keep the main window hidden at startup")
	}
	if appOptions.SingleInstanceLock == nil {
		t.Fatal("expected app options to declare a single-instance lock")
	}
	// Asserted against the literal, not the constant: the lock id is the
	// load-bearing value, and a silently changed or colliding id disables
	// the guard without breaking anything else.
	if got := appOptions.SingleInstanceLock.UniqueId; got != "autoreas-bridge-single-instance" {
		t.Fatalf("expected single-instance lock id %q, got %q", "autoreas-bridge-single-instance", got)
	}
	if appOptions.SingleInstanceLock.OnSecondInstanceLaunch == nil {
		t.Fatal("expected app options to wire the second-instance launch handler")
	}
}
