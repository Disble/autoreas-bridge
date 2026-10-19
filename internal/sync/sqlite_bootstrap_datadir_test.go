package sync

import (
	"path/filepath"
	"strings"
	"testing"
)

// envWith returns a getenv seam that only knows DataDirEnvVar.
func envWith(dataDir string) func(string) string {
	return func(name string) string {
		if name == DataDirEnvVar {
			return dataDir
		}
		return ""
	}
}

func TestResolveBridgeDBPathUsesDataDirOverride(t *testing.T) {
	t.Parallel()

	roaming := filepath.Join(t.TempDir(), "Roaming")
	override := filepath.Join(t.TempDir(), "dev-data")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) { return roaming, nil },
		getenv:        envWith(override),
	}

	got, err := bootstrap.ResolveBridgeDBPath()
	if err != nil {
		t.Fatalf("resolve bridge db path: %v", err)
	}
	if want := filepath.Join(override, "bridge.db"); got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	assertDirectoryExists(t, override)
}

func TestResolveExistingBridgeDBPathUsesDataDirOverride(t *testing.T) {
	t.Parallel()

	override := filepath.Join(t.TempDir(), "dev-data")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) { return t.TempDir(), nil },
		getenv:        envWith(override),
	}
	if _, err := bootstrap.ResolveExistingBridgeDBPath(); err == nil {
		t.Fatal("expected a missing override database to fail closed")
	}
}

func TestResolveBridgeDBPathRejectsUnsafeDataDirOverride(t *testing.T) {
	t.Parallel()

	roaming := filepath.Join(t.TempDir(), "Roaming")
	cases := []struct {
		name     string
		override string
		wantErr  string
	}{
		{"relative path", filepath.Join("dev", "data"), "absolute"},
		{"the live data directory", filepath.Join(roaming, "Autoreas", "data"), "live"},
		{"the live data directory, not clean", filepath.Join(roaming, "Autoreas", "data") + string(filepath.Separator) + ".", "live"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			for _, resolve := range []func(SQLiteBootstrap) (string, error){
				SQLiteBootstrap.ResolveBridgeDBPath,
				SQLiteBootstrap.ResolveExistingBridgeDBPath,
			} {
				_, err := resolve(SQLiteBootstrap{
					userConfigDir: func() (string, error) { return roaming, nil },
					getenv:        envWith(tc.override),
				})
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) || !strings.Contains(err.Error(), DataDirEnvVar) {
					t.Fatalf("expected an error naming %s and %q, got %v", DataDirEnvVar, tc.wantErr, err)
				}
			}
		})
	}
}

func TestDataDirOverride(t *testing.T) {
	t.Parallel()

	abs := filepath.Join(t.TempDir(), "dev-data")
	cases := []struct {
		name   string
		value  string
		want   string
		wantOK bool
	}{
		{"unset", "", "", false},
		{"blank", "   ", "", false},
		{"set", abs, abs, true},
		{"set with spaces and a trailing separator", "  " + abs + string(filepath.Separator) + "  ", abs, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, ok := DataDirOverride(envWith(tc.value))
			if got != tc.want || ok != tc.wantOK {
				t.Fatalf("expected (%q, %v), got (%q, %v)", tc.want, tc.wantOK, got, ok)
			}
		})
	}
	if _, ok := DataDirOverride(nil); ok {
		t.Fatal("expected a nil getenv to mean no override")
	}
}
