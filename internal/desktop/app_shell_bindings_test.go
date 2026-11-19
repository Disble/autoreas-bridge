package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
)

// shellApp returns an App whose pickers answer picked, failing with pickErr, and whose MyAnimeList
// client finds nothing, with every domain module left in state.
func shellApp(picked string, pickErr error, state lifecycle.State) *App {
	picker := func(context.Context, string) (string, error) { return picked, pickErr }
	app := &App{ctx: context.Background(), pickFile: picker, pickFolder: picker, myanimelistClient: &fakeMyAnimeListClient{}}
	if state == lifecycle.StateFailed {
		app.moduleSet().writer.FailStarting(moduleFailureReason)
	}
	return app
}

// shellBindings are the bindings the always-ready shell handle serves besides the readiness and
// error report ones; each call fails the test unless it answers a ready value.
var shellBindings = []struct {
	name string
	call func(t *testing.T, app *App)
}{
	{"PickFile", func(t *testing.T, app *App) {
		if got, err := app.PickFile("Cover"); err != nil || got != `C:/covers/a.png` {
			t.Fatalf("PickFile = %q, %v", got, err)
		}
	}},
	{"PickFolder", func(t *testing.T, app *App) {
		if got, err := app.PickFolder("Folder"); err != nil || got != `C:/covers/a.png` {
			t.Fatalf("PickFolder = %q, %v", got, err)
		}
	}},
	{"SearchMyAnimeList", func(t *testing.T, app *App) {
		if got, err := app.SearchMyAnimeList("bleach"); err != nil || got.Outcome == "" {
			t.Fatalf("SearchMyAnimeList = %#v, %v", got, err)
		}
	}},
	{"GetMyAnimeListDetail", func(t *testing.T, app *App) {
		if got, err := app.GetMyAnimeListDetail(1); err != nil || got.Outcome == "" {
			t.Fatalf("GetMyAnimeListDetail = %#v, %v", got, err)
		}
	}},
	{"GetJDMaxSimultaneousDownloads", func(t *testing.T, app *App) {
		if got, err := app.GetJDMaxSimultaneousDownloads(); err != nil || got < 0 {
			t.Fatalf("GetJDMaxSimultaneousDownloads = %d, %v", got, err)
		}
	}},
}

// TestShellBindingsNeverWaitForAModule pins that the pickers, the MyAnimeList lookups and the
// JDownloader limit answer while every domain module starts and after they failed: none of them
// depends on a module, so the always-ready shell handle serves them.
func TestShellBindingsNeverWaitForAModule(t *testing.T) {
	t.Parallel()
	for _, binding := range shellBindings {
		t.Run(binding.name+"/starting then failed", func(t *testing.T) {
			t.Parallel()
			app := shellApp(`C:/covers/a.png`, nil, lifecycle.StateStarting)
			binding.call(t, app)
			app.moduleSet().writer.FailStarting(moduleFailureReason)
			binding.call(t, app)
		})
	}
}

// TestPickersAnswerCancelPathOrInternal pins the pickers' answers: a cancelled dialog is "" with
// no error, a failing dialog or a missing picker is internal, never a silent "".
func TestPickersAnswerCancelPathOrInternal(t *testing.T) {
	t.Parallel()
	dialogFailure := errors.New("dialog crashed")
	pickers := []struct {
		name string
		what string
		call func(*App) (string, error)
		drop func(*App)
	}{
		{"PickFile", "file", func(a *App) (string, error) { return a.PickFile("t") }, func(a *App) { a.pickFile = nil }},
		{"PickFolder", "folder", func(a *App) (string, error) { return a.PickFolder("t") }, func(a *App) { a.pickFolder = nil }},
	}
	for _, picker := range pickers {
		t.Run(picker.name+"/cancel", func(t *testing.T) {
			t.Parallel()
			if got, err := picker.call(shellApp("", nil, lifecycle.StateStarting)); err != nil || got != "" {
				t.Fatalf("%s = %q, %v; want a cancelled dialog to be empty with no error", picker.name, got, err)
			}
		})
		t.Run(picker.name+"/dialog failure", func(t *testing.T) {
			t.Parallel()
			_, err := picker.call(shellApp("", dialogFailure, lifecycle.StateStarting))
			if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal || !errors.Is(err, dialogFailure) ||
				err.Error() != "open "+picker.what+" dialog: dialog crashed" {
				t.Fatalf("%s = %v (code %q), want internal carrying the dialog failure", picker.name, err, code)
			}
		})
		t.Run(picker.name+"/no picker", func(t *testing.T) {
			t.Parallel()
			app := &App{ctx: context.Background(), pickFile: func(context.Context, string) (string, error) { return "x", nil }}
			app.pickFolder = app.pickFile
			picker.drop(app)
			_, err := picker.call(app)
			if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal || err.Error() != picker.what+" picker unavailable" {
				t.Fatalf("%s = %v (code %q), want internal %s picker unavailable", picker.name, err, code, picker.what)
			}
		})
	}
}
