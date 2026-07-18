package api

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
)

type fakeOutboundConn struct {
	net.Conn
	local  net.Addr
	closed bool
}

func (c *fakeOutboundConn) LocalAddr() net.Addr { return c.local }

func (c *fakeOutboundConn) Close() error {
	c.closed = true
	return nil
}

func TestChooseEffectiveHostPrefersRoutedOutboundIP(t *testing.T) {
	t.Parallel()

	host, err := chooseEffectiveHost("192.168.2.172", func() (string, error) {
		t.Fatalf("fallback interface scan must not run when an outbound IP exists")
		return "", nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if host != "192.168.2.172" {
		t.Fatalf("expected routed outbound IP, got %q", host)
	}
}

func TestChooseEffectiveHostFallsBackWhenNoOutboundIP(t *testing.T) {
	t.Parallel()

	host, err := chooseEffectiveHost("", func() (string, error) {
		return "10.0.0.5", nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if host != "10.0.0.5" {
		t.Fatalf("expected fallback host, got %q", host)
	}
}

func TestPreferredOutboundIPReturnsRoutedIPv4(t *testing.T) {
	t.Parallel()

	conn := &fakeOutboundConn{local: &net.UDPAddr{IP: net.ParseIP("192.168.2.172"), Port: 54321}}
	got := preferredOutboundIP(func(network, address string) (net.Conn, error) {
		if network != "udp" {
			t.Fatalf("expected a udp routing probe, got network %q", network)
		}
		return conn, nil
	})

	if got != "192.168.2.172" {
		t.Fatalf("expected routed LAN IPv4, got %q", got)
	}
	if !conn.closed {
		t.Fatalf("expected the routing probe socket to be closed")
	}
}

func TestPreferredOutboundIPReturnsEmptyOnDialError(t *testing.T) {
	t.Parallel()

	got := preferredOutboundIP(func(network, address string) (net.Conn, error) {
		return nil, errors.New("network is unreachable")
	})
	if got != "" {
		t.Fatalf("expected empty host when offline, got %q", got)
	}
}

func TestPreferredOutboundIPIgnoresLoopback(t *testing.T) {
	t.Parallel()

	conn := &fakeOutboundConn{local: &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 1}}
	got := preferredOutboundIP(func(network, address string) (net.Conn, error) {
		return conn, nil
	})
	if got != "" {
		t.Fatalf("expected empty host for loopback route, got %q", got)
	}
}

func TestHTTPServerEffectiveAddressUsesResolvedHostAndPort(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	server := NewServer(Config{Addr: "0.0.0.0:0", RealtimeHub: realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}), Logger: logger}).(*HTTPServer)
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

	entries := logger.entries()
	if len(entries) == 0 || entries[0].Domain != "api" || entries[0].Level != sharedlogger.LevelInfo {
		t.Fatalf("expected api info log on start, got %#v", entries)
	}
}

func TestNewServerDefaultsToLanBinding(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{}).(*HTTPServer)
	if got, want := server.addr, "0.0.0.0:8080"; got != want {
		t.Fatalf("expected default addr %q, got %q", want, got)
	}
}

type recordingAPILogger struct {
	entriesList []sharedlogger.LogEntry
}

func (l *recordingAPILogger) Debugf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelDebug})
}

func (l *recordingAPILogger) Infof(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelInfo})
}

func (l *recordingAPILogger) Warnf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelWarn})
}

func (l *recordingAPILogger) Errorf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelError})
}

func (l *recordingAPILogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{
		Domain:        domain,
		Level:         level,
		CorrelationID: fields.CorrelationID,
		EntityID:      fields.EntityID,
		EventType:     fields.EventType,
		DurationMs:    fields.DurationMs,
		Metadata:      fields.Metadata,
	})
}

// entries returns a copy of the logger entries captured by the test double.
func (l *recordingAPILogger) entries() []sharedlogger.LogEntry {
	out := make([]sharedlogger.LogEntry, len(l.entriesList))
	copy(out, l.entriesList)
	return out
}
