package modules_test

import (
	"errors"
	"testing"

	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/modules"
)

// episodeServices stands in for one module's services.
type episodeServices struct{ rows []string }

// errDomain stands in for a domain sentinel error.
var errDomain = errors.New("anime 7 not found in store")

// listRows is a binding body: it reads the services and may fail.
func listRows(fail error) func(episodeServices) ([]string, error) {
	return func(services episodeServices) ([]string, error) {
		return services.rows, fail
	}
}

// newEpisodes registers the episodes module and returns its handle and writer.
func newEpisodes(t *testing.T) (*modules.Handle[episodeServices], *lifecycle.Writer) {
	t.Helper()
	registry, writer := lifecycle.New(nil)
	writer.Register("episodes")
	return modules.NewHandle[episodeServices]("episodes", registry), writer
}

func TestUseFollowsTheModuleState(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		prepare  func(*modules.Handle[episodeServices], *lifecycle.Writer)
		fail     error
		wantRows int
		wantCode apperr.Code
		wantMsg  string
	}{
		{
			name:     "starting module is unavailable",
			prepare:  func(*modules.Handle[episodeServices], *lifecycle.Writer) {},
			wantCode: apperr.CodeUnavailable,
			wantMsg:  "episodes is starting",
		},
		{
			name: "failed module is a failed precondition with its reason",
			prepare: func(_ *modules.Handle[episodeServices], w *lifecycle.Writer) {
				_ = w.MarkFailed("episodes", "bridge database failed to open: locked")
			},
			wantCode: apperr.CodeFailedPrecondition,
			wantMsg:  "bridge database failed to open: locked",
		},
		{
			name: "ready module without services is internal",
			prepare: func(_ *modules.Handle[episodeServices], w *lifecycle.Writer) {
				_ = w.MarkReady("episodes")
			},
			wantCode: apperr.CodeInternal,
			wantMsg:  "episodes is ready without services",
		},
		{
			name:     "ready module runs the closure",
			prepare:  bindAndReady,
			wantRows: 2,
		},
		{
			name:     "plain closure error becomes internal",
			prepare:  bindAndReady,
			fail:     errDomain,
			wantCode: apperr.CodeInternal,
			wantMsg:  errDomain.Error(),
		},
		{
			name:     "coded closure error keeps its code",
			prepare:  bindAndReady,
			fail:     apperr.NotFound("anime 7 not found"),
			wantCode: apperr.CodeNotFound,
			wantMsg:  "anime 7 not found",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			handle, writer := newEpisodes(t)
			tc.prepare(handle, writer)

			rows, err := handle.Use(listRows(tc.fail))

			assertUse(t, rows, err, tc.wantRows, tc.wantCode, tc.wantMsg)
		})
	}
}

// bindAndReady wires the services, then marks the module ready, as the composition root does.
func bindAndReady(handle *modules.Handle[episodeServices], writer *lifecycle.Writer) {
	handle.Bind(episodeServices{rows: []string{"a", "b"}})
	_ = writer.MarkReady(handle.ID())
}

// assertUse checks the rows and the failure code and message of one Use call.
func assertUse(t *testing.T, rows []string, err error, wantRows int, wantCode apperr.Code, wantMsg string) {
	t.Helper()
	if len(rows) != wantRows {
		t.Fatalf("rows = %v, want %d rows", rows, wantRows)
	}
	if wantCode == "" {
		if err != nil {
			t.Fatalf("err = %v, want nil", err)
		}
		return
	}
	code, ok := apperr.CodeOf(err)
	if !ok || code != wantCode || err.Error() != wantMsg {
		t.Fatalf("err = %v (code %q, %v), want %q %q", err, code, ok, wantCode, wantMsg)
	}
}

func TestUseOnAnUnregisteredModuleIsInternal(t *testing.T) {
	t.Parallel()
	registry, _ := lifecycle.New(nil)
	handle := modules.NewHandle[episodeServices]("season", registry)
	handle.Bind(episodeServices{rows: []string{"a"}})

	rows, err := handle.Use(listRows(nil))

	assertUse(t, rows, err, 0, apperr.CodeInternal, "season is not registered")
}

func TestUseKeepsTheDomainCause(t *testing.T) {
	t.Parallel()
	handle, writer := newEpisodes(t)
	bindAndReady(handle, writer)

	_, err := handle.Use(listRows(errDomain))

	if !errors.Is(err, errDomain) {
		t.Fatalf("err = %v, want it to wrap the domain error", err)
	}
}

func TestShellIsAlwaysReady(t *testing.T) {
	t.Parallel()
	registry, writer := lifecycle.New(nil)
	writer.Register("episodes")
	shell := modules.NewShell(modules.ShellServices{
		EffectiveAddress: func() string { return "192.168.1.5:8080" },
		Readiness:        registry,
	})

	address, err := shell.Use(func(services modules.ShellServices) (string, error) {
		return services.EffectiveAddress() + "/" + string(services.Readiness.Snapshot()[0].State), nil
	})
	if err != nil || address != "192.168.1.5:8080/starting" {
		t.Fatalf("Use() = %q, %v; want the shell services", address, err)
	}

	value, err := shell.Use(func(modules.ShellServices) (string, error) { return "partial", errDomain })
	assertUse(t, nil, err, 0, apperr.CodeInternal, errDomain.Error())
	if value != "" {
		t.Fatalf("value = %q on failure, want the zero value", value)
	}
}
