package main

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/preferences"
)

// fakePreferencesStore is a test double for preferences.Store that records calls and
// returns configurable responses — no database involved.
type fakePreferencesStore struct {
	seasonMode    bool
	setErr        error
	getErr        error
	setCallsCount int
}

func (f *fakePreferencesStore) SeasonMode(context.Context) (bool, error) {
	return f.seasonMode, f.getErr
}

func (f *fakePreferencesStore) SetSeasonMode(_ context.Context, enabled bool) error {
	f.setCallsCount++
	if f.setErr != nil {
		return f.setErr
	}
	f.seasonMode = enabled
	return nil
}

var _ preferences.Store = (*fakePreferencesStore)(nil)

// ── nil store safety ──────────────────────────────────────────────────────────────

func TestGetSeasonModeReturnsFalseWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.GetSeasonMode()
	if got {
		t.Fatal("expected GetSeasonMode to return false when preferences store is nil")
	}
}

func TestGetSeasonModeDoesNotPanicWhenStoreNil(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("GetSeasonMode panicked with nil store: %v", r)
		}
	}()

	app := &App{ctx: context.Background()}
	_ = app.GetSeasonMode()
}

func TestSetSeasonModeReturnsErrorStringWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.SetSeasonMode(true)
	if got == "" || got == "ok" {
		t.Fatalf("expected non-ok error string when preferences store is nil, got %q", got)
	}
}

func TestSetSeasonModeDoesNotPanicWhenStoreNil(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("SetSeasonMode panicked with nil store: %v", r)
		}
	}()

	app := &App{ctx: context.Background()}
	_ = app.SetSeasonMode(true)
}

func TestSetSeasonModeReturnsPreferencesStoreUnavailableWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.SetSeasonMode(false)
	if got != "preferences store unavailable" {
		t.Fatalf("expected %q, got %q", "preferences store unavailable", got)
	}
}

// ── wired store round-trip ────────────────────────────────────────────────────────

func TestSetSeasonModeReturnsOkOnSuccess(t *testing.T) {
	t.Parallel()

	app := &App{
		ctx:              context.Background(),
		preferencesStore: &fakePreferencesStore{},
	}
	got := app.SetSeasonMode(true)
	if got != "ok" {
		t.Fatalf("expected %q on success, got %q", "ok", got)
	}
}

func TestGetSeasonModeReturnsStoredValue(t *testing.T) {
	t.Parallel()

	fake := &fakePreferencesStore{seasonMode: true}
	app := &App{
		ctx:              context.Background(),
		preferencesStore: fake,
	}
	if !app.GetSeasonMode() {
		t.Fatal("expected GetSeasonMode to return true when store holds true")
	}
}

func TestGetSeasonModeReturnsFalseOnStoreError(t *testing.T) {
	t.Parallel()

	fake := &fakePreferencesStore{getErr: errors.New("db error")}
	app := &App{
		ctx:              context.Background(),
		preferencesStore: fake,
	}
	if app.GetSeasonMode() {
		t.Fatal("expected GetSeasonMode to return false when store returns error")
	}
}

func TestSetSeasonModeReturnsErrStringOnStoreError(t *testing.T) {
	t.Parallel()

	fake := &fakePreferencesStore{setErr: errors.New("write failure")}
	app := &App{
		ctx:              context.Background(),
		preferencesStore: fake,
	}
	got := app.SetSeasonMode(true)
	if got != "write failure" {
		t.Fatalf("expected %q, got %q", "write failure", got)
	}
}

// TestSetThenGetSeasonModeRoundTrip verifies the full binding round-trip via the fake store.
func TestSetThenGetSeasonModeRoundTrip(t *testing.T) {
	t.Parallel()

	fake := &fakePreferencesStore{}
	app := &App{
		ctx:              context.Background(),
		preferencesStore: fake,
	}

	if result := app.SetSeasonMode(true); result != "ok" {
		t.Fatalf("SetSeasonMode(true): expected %q, got %q", "ok", result)
	}
	if !app.GetSeasonMode() {
		t.Fatal("expected GetSeasonMode to return true after SetSeasonMode(true)")
	}

	if result := app.SetSeasonMode(false); result != "ok" {
		t.Fatalf("SetSeasonMode(false): expected %q, got %q", "ok", result)
	}
	if app.GetSeasonMode() {
		t.Fatal("expected GetSeasonMode to return false after SetSeasonMode(false)")
	}
}
