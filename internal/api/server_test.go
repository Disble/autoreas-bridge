package api

import (
	"context"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/realtime"
)

func TestHTTPServerEffectiveAddressUsesResolvedHostAndPort(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{Addr: "0.0.0.0:0", RealtimeHub: realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{})}).(*HTTPServer)
	server.resolveEffectiveHost = func() (string, error) {
		return "192.168.1.50", nil
	}
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	got := server.EffectiveAddress()
	if !strings.HasPrefix(got, "192.168.1.50:") {
		t.Fatalf("expected effective address to use resolved host, got %q", got)
	}

	if strings.HasSuffix(got, ":0") {
		t.Fatalf("expected effective address to expose bound port, got %q", got)
	}
}

func TestNewServerDefaultsToLanBinding(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{}).(*HTTPServer)
	if got, want := server.addr, "0.0.0.0:8080"; got != want {
		t.Fatalf("expected default addr %q, got %q", want, got)
	}
}
