package api

import "testing"

// ResolveAddr exists so a port conflict stops being fatal. The failure it
// answers to is recorded in docs/learning-log.md: a second instance losing the
// bind set startupErr, which gated startup, which left the download readiness
// service nil. So every case here that supplies a bad value asserts the server
// still gets an address to bind rather than an error to report.
func TestResolveAddrFallsBackToTheDefaultWhenNothingIsConfigured(t *testing.T) {
	t.Parallel()

	addr, rejected := ResolveAddr("", func(string) string { return "" })

	if addr != "0.0.0.0:9876" {
		t.Fatalf("addr = %q, want %q", addr, "0.0.0.0:9876")
	}
	if rejected != "" {
		t.Fatalf("rejected = %q, want no rejection", rejected)
	}
}

// A human editing a port setting types a port, not a bind address. Accepting
// the bare number is what keeps the setting usable without documenting the
// "0.0.0.0:" prefix as a requirement.
func TestResolveAddrExpandsABarePortToAllInterfaces(t *testing.T) {
	t.Parallel()

	addr, rejected := ResolveAddr("9999", func(string) string { return "" })

	if addr != "0.0.0.0:9999" {
		t.Fatalf("addr = %q, want %q", addr, "0.0.0.0:9999")
	}
	if rejected != "" {
		t.Fatalf("rejected = %q, want no rejection", rejected)
	}
}

func TestResolveAddrKeepsAFullyQualifiedAddress(t *testing.T) {
	t.Parallel()

	addr, rejected := ResolveAddr("127.0.0.1:9999", func(string) string { return "" })

	if addr != "127.0.0.1:9999" {
		t.Fatalf("addr = %q, want %q", addr, "127.0.0.1:9999")
	}
	if rejected != "" {
		t.Fatalf("rejected = %q, want no rejection", rejected)
	}
}

// The environment override is the recovery path. When the bind fails the app
// does not reach a settings screen, so the escape hatch cannot live behind one.
func TestResolveAddrPrefersTheEnvironmentOverThePersistedSetting(t *testing.T) {
	t.Parallel()

	addr, rejected := ResolveAddr("127.0.0.1:1111", func(name string) string {
		if name == "AUTOREAS_BRIDGE_ADDR" {
			return "0.0.0.0:2222"
		}
		return ""
	})

	if addr != "0.0.0.0:2222" {
		t.Fatalf("addr = %q, want the environment value", addr)
	}
	if rejected != "" {
		t.Fatalf("rejected = %q, want no rejection", rejected)
	}
}

func TestResolveAddrExpandsABarePortFromTheEnvironment(t *testing.T) {
	t.Parallel()

	addr, _ := ResolveAddr("", func(string) string { return "3333" })

	if addr != "0.0.0.0:3333" {
		t.Fatalf("addr = %q, want %q", addr, "0.0.0.0:3333")
	}
}

func TestResolveAddrTrimsSurroundingWhitespace(t *testing.T) {
	t.Parallel()

	addr, _ := ResolveAddr("  9999  ", func(string) string { return "" })

	if addr != "0.0.0.0:9999" {
		t.Fatalf("addr = %q, want %q", addr, "0.0.0.0:9999")
	}
}

// Reporting the rejected text back is the point: the caller logs it, so a
// typo is visible instead of silently behaving as if nothing was configured.
func TestResolveAddrRejectsUnusableValuesAndReportsThem(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name    string
		setting string
	}{
		{name: "not an address", setting: "garbage"},
		{name: "port zero", setting: "0"},
		{name: "port above the maximum", setting: "70000"},
		{name: "negative port", setting: "-1"},
		{name: "port is not a number", setting: "0.0.0.0:http"},
		{name: "host without a port", setting: "0.0.0.0:"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			addr, rejected := ResolveAddr(tt.setting, func(string) string { return "" })

			if addr != "0.0.0.0:9876" {
				t.Fatalf("addr = %q, want the default after rejecting %q", addr, tt.setting)
			}
			if rejected != tt.setting {
				t.Fatalf("rejected = %q, want %q reported back", rejected, tt.setting)
			}
		})
	}
}

// An unusable override must not take the valid setting down with it.
func TestResolveAddrFallsThroughToTheSettingWhenTheEnvironmentIsUnusable(t *testing.T) {
	t.Parallel()

	addr, rejected := ResolveAddr("127.0.0.1:9999", func(string) string { return "not-a-port" })

	if addr != "127.0.0.1:9999" {
		t.Fatalf("addr = %q, want the persisted setting", addr)
	}
	if rejected != "not-a-port" {
		t.Fatalf("rejected = %q, want the bad override reported", rejected)
	}
}

// The bounds are asserted at the edge, not far outside it. Rejecting 70000
// proves only that something very large is refused: mutation testing moved the
// limit to 65534 and to 65536 and no test noticed either time.
func TestResolveAddrAcceptsTheEdgesOfThePortRange(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name    string
		setting string
		want    string
	}{
		{name: "lowest usable port", setting: "1", want: "0.0.0.0:1"},
		{name: "highest usable port", setting: "65535", want: "0.0.0.0:65535"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			addr, rejected := ResolveAddr(tt.setting, func(string) string { return "" })

			if addr != tt.want {
				t.Fatalf("addr = %q, want %q", addr, tt.want)
			}
			if rejected != "" {
				t.Fatalf("rejected = %q, want %q accepted", rejected, tt.setting)
			}
		})
	}
}

func TestResolveAddrRejectsOnePastTheHighestPort(t *testing.T) {
	t.Parallel()

	addr, rejected := ResolveAddr("65536", func(string) string { return "" })

	if addr != "0.0.0.0:9876" {
		t.Fatalf("addr = %q, want the default", addr)
	}
	if rejected != "65536" {
		t.Fatalf("rejected = %q, want %q", rejected, "65536")
	}
}
