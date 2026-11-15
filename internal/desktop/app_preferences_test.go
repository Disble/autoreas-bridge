package desktop

import (
	"context"
	"testing"
)

// Season mode is a DERIVED state (SDD-41b): on exactly while a season is open.
// These tests exercise the derived GetSeasonMode binding and the shared
// seasonModeReader seam (used by downloads + mobile status).

func TestSeasonModeReaderFalseWhenServiceNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if app.seasonModeReader()(context.Background()) {
		t.Fatal("expected season mode off when the season service is nil")
	}
}

func TestGetSeasonModeFalseWhenNoOpenSeason(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	if must(t).value(app.GetSeasonMode()) {
		t.Fatal("expected GetSeasonMode false with no open season")
	}
}

func TestGetSeasonModeTrueWhileSeasonOpen(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	if got := app.CreateSeason("Julio 2026"); got != nil {
		t.Fatalf("CreateSeason: %q", got)
	}
	if !must(t).value(app.GetSeasonMode()) {
		t.Fatal("expected season mode on while a season is open")
	}
}

func TestGetSeasonModeFalseAfterClose(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")
	if got := app.CloseSeason(); got != nil {
		t.Fatalf("CloseSeason: %q", got)
	}
	if must(t).value(app.GetSeasonMode()) {
		t.Fatal("expected season mode off after closing the season")
	}
}

func TestSeasonModeReaderDerivesFromOpenSeason(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	reader := app.seasonModeReader()
	ctx := context.Background()

	if reader(ctx) {
		t.Fatal("reader should be false before any season exists")
	}
	_ = app.CreateSeason("Julio 2026")
	if !reader(ctx) {
		t.Fatal("reader should be true with an open season")
	}
}
