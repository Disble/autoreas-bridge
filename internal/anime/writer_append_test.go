package anime

import (
	"context"
	"errors"
	"io"
	"testing"

	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/events"
)

func TestAppendRecordWritesPayloadAndNewlineOnceBeforeSync(t *testing.T) {
	t.Parallel()

	file := &appendFileSpy{}
	payload := []byte("{\"_id\":\"anime-1\"}\n")
	if err := appendRecord(file, payload); err != nil {
		t.Fatalf("append complete record: %v", err)
	}
	if len(file.writes) != 1 {
		t.Fatalf("expected one write call, got %d", len(file.writes))
	}
	if got, want := string(file.writes[0]), "{\"_id\":\"anime-1\"}\n"; got != want {
		t.Fatalf("unexpected complete record: want %q, got %q", want, got)
	}
	if !file.synced || file.syncBeforeWrite {
		t.Fatalf("expected Sync after the complete write: %#v", file)
	}
}

func TestAppendRecordClassifiesShortWriteAndSyncFailureAsAmbiguous(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name string
		file *appendFileSpy
	}{
		{name: "short write", file: &appendFileSpy{writeLimit: 1}},
		{name: "sync failure", file: &appendFileSpy{syncErr: errors.New("injected sync failure")}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := appendRecord(tt.file, []byte(`{"_id":"anime-1"}`))
			if !legacy.IsAmbiguousAppendError(err) {
				t.Fatalf("expected ambiguous append error, got %v", err)
			}
			if tt.name == "short write" && !errors.Is(err, io.ErrShortWrite) {
				t.Fatalf("expected short-write cause, got %v", err)
			}
		})
	}
}

func TestUpdateWriterPreservesSelfEchoOnlyForAmbiguousAppend(t *testing.T) {
	for _, tt := range []struct {
		name           string
		appendErr      error
		wantRemembered bool
	}{
		{name: "ambiguous append may have changed file", appendErr: legacy.NewAmbiguousAppendError(errors.New("sync failed")), wantRemembered: true},
		{name: "definite append did not change file", appendErr: legacy.NewDefiniteAppendError(errors.New("open failed")), wantRemembered: false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			payload := []byte(`{"_id":"anime-1"}`)
			selfEcho := NewSelfEchoRegistry()
			writer := NewUpdateWriter(UpdateWriterConfig{
				FilePath:         "data/animes.dat",
				Bus:              events.NewBus(),
				SelfEchoRegistry: selfEcho,
				AppendLine:       func(string, []byte) error { return tt.appendErr },
			}).(*updateWriter)
			ctx, cancel := context.WithCancel(context.Background())
			writer.StartAsync(ctx)
			if err := writer.RequestAppend(ctx, "anime-1", payload); err == nil {
				t.Fatal("expected append failure")
			}
			if got := selfEcho.ConsumeIfPresent(payload); got != tt.wantRemembered {
				t.Fatalf("unexpected self-echo retention: want %v, got %v", tt.wantRemembered, got)
			}
			cancel()
			writer.Wait()
		})
	}
}

type appendFileSpy struct {
	writes          [][]byte
	writeLimit      int
	syncErr         error
	synced          bool
	syncBeforeWrite bool
}

func (f *appendFileSpy) Write(payload []byte) (int, error) {
	f.writes = append(f.writes, append([]byte(nil), payload...))
	if f.writeLimit > 0 && f.writeLimit < len(payload) {
		return f.writeLimit, nil
	}
	return len(payload), nil
}

func (f *appendFileSpy) Sync() error {
	f.syncBeforeWrite = len(f.writes) == 0
	f.synced = true
	return f.syncErr
}
