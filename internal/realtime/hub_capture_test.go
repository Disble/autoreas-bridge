package realtime

import (
	"context"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/observability/requestcapture"

	"autoreas-bridge/internal/testsupport/async"
)

func TestMemoryHubRegisterCapturesWSConnectOpened(t *testing.T) {
	t.Parallel()

	sink := newRecordingCaptureSink()
	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 2, ClientBuffer: 2, Capture: sink.capture})
	t.Cleanup(func() { _ = hub.Close() })

	client := newRecordingClient("device-9-1")
	if err := hub.Register(context.Background(), client); err != nil {
		t.Fatalf("register client: %v", err)
	}
	consumeControlMessage(t, client.Receive(t))

	records := sink.wait(t, 1)
	if records[0].Kind != "ws_connect" || records[0].Outcome != "opened" {
		t.Fatalf("unexpected connect capture %#v", records[0])
	}
	if records[0].Device.DeviceID != "device-9" {
		t.Fatalf("expected device id parsed from client id prefix, got %#v", records[0].Device)
	}
	if records[0].HTTPStatus != nil || records[0].DurationMS != nil {
		t.Fatalf("expected a one-way frame (nil status/duration), got %#v", records[0])
	}
}

func TestMemoryHubUnregisterCapturesWSDisconnectClosed(t *testing.T) {
	t.Parallel()

	sink := newRecordingCaptureSink()
	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 2, ClientBuffer: 2, Capture: sink.capture})
	t.Cleanup(func() { _ = hub.Close() })

	client := newRecordingClient("device-9-1")
	if err := hub.Register(context.Background(), client); err != nil {
		t.Fatalf("register client: %v", err)
	}
	consumeControlMessage(t, client.Receive(t))
	sink.wait(t, 1)

	hub.Unregister(client.ID())

	records := sink.wait(t, 2)
	if records[1].Kind != "ws_disconnect" || records[1].Outcome != "closed" {
		t.Fatalf("unexpected disconnect capture %#v", records[1])
	}
}

func TestMemoryHubBroadcastAnimeChangedCapturesWSBroadcastPushed(t *testing.T) {
	t.Parallel()

	sink := newRecordingCaptureSink()
	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 4, ClientBuffer: 4, Capture: sink.capture})
	t.Cleanup(func() { _ = hub.Close() })

	hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{AnimeID: "anime-123"})

	records := sink.wait(t, 1)
	record := records[0]
	if record.Kind != "ws_broadcast" || record.Outcome != "pushed" {
		t.Fatalf("unexpected broadcast capture %#v", record)
	}
	if record.AnimeID == nil || *record.AnimeID != "anime-123" {
		t.Fatalf("expected anime_id anime-123, got %#v", record.AnimeID)
	}
	if record.HTTPStatus != nil || record.DurationMS != nil {
		t.Fatalf("expected a one-way frame (nil status/duration), got %#v", record)
	}
}

func TestMemoryHubBroadcastPreferencesChangedCapturesWSBroadcastPushed(t *testing.T) {
	t.Parallel()

	sink := newRecordingCaptureSink()
	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 4, ClientBuffer: 4, Capture: sink.capture})
	t.Cleanup(func() { _ = hub.Close() })

	hub.BroadcastPreferencesChanged(context.Background(), true)

	records := sink.wait(t, 1)
	if records[0].Kind != "ws_broadcast" || records[0].Outcome != "pushed" {
		t.Fatalf("unexpected broadcast capture %#v", records[0])
	}
	if seasonMode, ok := records[0].Payload["season_mode"].(bool); !ok || !seasonMode {
		t.Fatalf("expected payload season_mode=true, got %#v", records[0].Payload)
	}
}

func TestMemoryHubBroadcastSeasonChangedCapturesWSBroadcastPushed(t *testing.T) {
	t.Parallel()

	sink := newRecordingCaptureSink()
	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 4, ClientBuffer: 4, Capture: sink.capture})
	t.Cleanup(func() { _ = hub.Close() })

	hub.BroadcastSeasonChanged(context.Background(), "season-1", "open")

	records := sink.wait(t, 1)
	if records[0].Kind != "ws_broadcast" || records[0].Outcome != "pushed" {
		t.Fatalf("unexpected broadcast capture %#v", records[0])
	}
	if records[0].Payload["season_id"] != "season-1" || records[0].Payload["status"] != "open" {
		t.Fatalf("unexpected broadcast payload %#v", records[0].Payload)
	}
}

func TestMemoryHubNilCaptureSinkIsNoOp(t *testing.T) {
	t.Parallel()

	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 2, ClientBuffer: 2})
	t.Cleanup(func() { _ = hub.Close() })

	client := newRecordingClient("device-1-1")
	if err := hub.Register(context.Background(), client); err != nil {
		t.Fatalf("register client: %v", err)
	}
	consumeControlMessage(t, client.Receive(t))
	hub.Unregister(client.ID())
	hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{AnimeID: "anime-1"})
	// A nil Capture sink must never panic and never block any of the seams above.
}

func TestMemoryHubCaptureNeverBlocksBroadcastFanOut(t *testing.T) {
	t.Parallel()

	blocked := make(chan struct{})
	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 1, ClientBuffer: 1, Capture: func(requestcapture.CaptureRecord) bool {
		<-blocked
		return true
	}})
	t.Cleanup(func() { close(blocked); _ = hub.Close() })

	done := make(chan struct{})
	go func() {
		hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{AnimeID: "anime-1"})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected broadcast to return without waiting on a slow capture sink")
	}
}

// recordingCaptureSink records every capture row a hub seam enqueues.
type recordingCaptureSink struct {
	mu      sync.Mutex
	records []requestcapture.CaptureRecord
}

// newRecordingCaptureSink builds an empty recordingCaptureSink.
func newRecordingCaptureSink() *recordingCaptureSink {
	return &recordingCaptureSink{}
}

// capture implements requestcapture.CaptureFunc, appending record.
func (s *recordingCaptureSink) capture(record requestcapture.CaptureRecord) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.records = append(s.records, record)
	return true
}

// wait polls until at least want records were captured, then returns a copy.
func (s *recordingCaptureSink) wait(t *testing.T, want int) []requestcapture.CaptureRecord {
	t.Helper()
	async.Eventually(t, func() bool {
		s.mu.Lock()
		defer s.mu.Unlock()
		return len(s.records) >= want
	}, "expected at least %d captured records", want)
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]requestcapture.CaptureRecord(nil), s.records...)
}

// TestDeviceIDFromClientID pins every client id shape the hub can hand this
// helper. The leading-separator case is the one worth guarding: splitting
// there would report an empty device id for a client whose whole id is the
// device, so the helper deliberately returns the id untouched.
func TestDeviceIDFromClientID(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name     string
		clientID string
		want     string
	}{
		{name: "device and sequence", clientID: "device-9-1", want: "device-9"},
		{name: "single separator", clientID: "device-1", want: "device"},
		{name: "no separator", clientID: "device", want: "device"},
		{name: "leading separator", clientID: "-1", want: "-1"},
		{name: "trailing separator", clientID: "device-", want: "device"},
		{name: "empty", clientID: "", want: ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := deviceIDFromClientID(tt.clientID); got != tt.want {
				t.Fatalf("deviceIDFromClientID(%q) = %q, want %q", tt.clientID, got, tt.want)
			}
		})
	}
}
