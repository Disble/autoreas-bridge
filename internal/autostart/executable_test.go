package autostart

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsRegistrableExecutableRejectsThrowawayBuilds(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		path string
	}{
		{name: "go test binary", path: filepath.Join(os.TempDir(), "go-build1575831245", "b001", "autoreas-bridge.test.exe")},
		{name: "go test binary without extension", path: "/tmp/go-build123/b001/autoreas-bridge.test"},
		{name: "go-build segment outside temp", path: `D:\cache\go-build999\b001\autoreas-bridge.exe`},
		{name: "any temp directory binary", path: filepath.Join(os.TempDir(), "autoreas-bridge.exe")},
		{name: "wails dev build", path: `D:\dev\autoreas-bridge\build\bin\autoreas-bridge-dev.exe`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if isRegistrableExecutable(tt.path) {
				t.Fatalf("isRegistrableExecutable(%q) = true, want false", tt.path)
			}
		})
	}
}

func TestIsRegistrableExecutableAcceptsInstalledBuilds(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		path string
	}{
		{name: "program files install", path: `C:\Program Files\Autoreas Bridge\autoreas-bridge.exe`},
		{name: "per-user install", path: `C:\Users\User\AppData\Local\Programs\Autoreas Bridge\autoreas-bridge.exe`},
		{name: "release build output", path: `D:\dev\autoreas-bridge\build\bin\autoreas-bridge.exe`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !isRegistrableExecutable(tt.path) {
				t.Fatalf("isRegistrableExecutable(%q) = false, want true", tt.path)
			}
		})
	}
}
