package desktop

import (
	"os"
	"testing"
)

// stampProbeEnv carries the value a release build claims to have stamped into
// bridgeVersion. CI sets it alongside the matching -ldflags -X and runs this
// test; nothing sets it during an ordinary `go test ./...`, where the default
// assertion below runs instead.
const stampProbeEnv = "STAMP_PROBE_EXPECT"

// TestBridgeVersionIsStampable proves an `-ldflags -X` against this package
// actually reaches bridgeVersion, and it is the ONLY check that can.
//
// bridgeVersion is unexported and every exported backup bundle carries it into
// the user-visible import preview, so an unstamped release build labels its
// bundles "dev". Go ignores an -X whose symbol does not exist -- exit 0, no
// warning -- which makes the failure silent.
//
// Reading it from outside the binary does not work, and both obvious ways were
// shipped and later found useless. `go version -m` and a plain byte grep both
// match the -ldflags string the build just passed, so they pass a binary that
// stamped nothing. `go tool nm` finds a `<pkg>.bridgeVersion.str` symbol on a
// windows/amd64 PE but never on a linux/amd64 ELF -- measured on go1.27,
// identically with and without -X -- so it can never pass there.
//
// A test inside the package sidesteps all of it: it reads the linked variable
// itself, so it is exact on every platform.
func TestBridgeVersionIsStampable(t *testing.T) {
	want := os.Getenv(stampProbeEnv)
	if want == "" {
		if bridgeVersion != "dev" {
			t.Fatalf("unstamped bridgeVersion = %q, want %q", bridgeVersion, "dev")
		}
		return
	}
	if bridgeVersion != want {
		t.Fatalf("bridgeVersion = %q, want %q -- the -X stamp did not resolve", bridgeVersion, want)
	}
}
