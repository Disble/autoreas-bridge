//go:build windows

package webview2

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// TestEngineClearsAFixtureCookieWithoutShowingAWindow runs the real engine behind the
// production boundary: a solver child, confined to runChild's kill-on-close job, solves the
// fixture and reports the clearance on the protocol. It skips only when the WebView2 runtime is
// genuinely absent.
func TestEngineClearsAFixtureCookieWithoutShowingAWindow(t *testing.T) {
	if testing.Short() {
		t.Skip("the engine fixture drives a real WebView2")
	}
	nonce := strconv.FormatInt(time.Now().UnixNano(), 36)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintf(w, `<!doctype html><html><body><script>document.cookie="cf_clearance=fixture-%s; path=/";</script>ok</body></html>`, nonce)
	}))
	defer srv.Close()
	dataDir, err := os.MkdirTemp("", "cfclearance-fixture-")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("engine profile kept for inspection: %s", dataDir)
	report := filepath.Join(t.TempDir(), "window")
	t.Setenv(fakeChildEnv, engineChildMode)
	t.Setenv(windowReportEnv, report)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	solver := &ProcessSolver{Executable: exe, DataDir: dataDir, Timeout: 20 * time.Second}
	got, err := solver.Solve(context.Background(), srv.URL, "stale")
	if err != nil && strings.Contains(err.Error(), runtimeUnavailable) {
		t.Skip(err)
	}
	if err != nil {
		t.Fatal(err)
	}
	var clearance *http.Cookie
	for _, c := range got.Cookies {
		if c.Name == clearanceCookie {
			clearance = c
		}
	}
	if clearance == nil || clearance.Value != "fixture-"+nonce {
		t.Fatalf("cookies = %+v, want the fixture cf_clearance", got.Cookies)
	}
	t.Logf("user agent: %q", got.UserAgent)
	if !strings.Contains(got.UserAgent, "Edg/") {
		t.Fatalf("user agent %q is not the engine's", got.UserAgent)
	}
	if checks, visible := readWindowReport(t, report); checks == 0 || visible != 0 {
		t.Fatalf("window visibility: %d checks, visible %d times", checks, visible)
	}
	started := time.Now()
	if n := browserProcessesUsing(t, dataDir, engineTeardownBudget); n != 0 {
		t.Fatalf("%d msedgewebview2 process(es) still use %s after %s", n, dataDir, engineTeardownBudget)
	}
	t.Logf("engine teardown took %s", time.Since(started).Round(time.Millisecond))
}

// runRealEngineChild solves with the real engine, the way production's solver child does, and
// records its host window's visibility so the fixture can assert it stayed hidden. It ends the
// child process the way production does too.
func runRealEngineChild() {
	var checks, visible atomic.Int32
	stop := make(chan struct{})
	engine = func(req engineRequest) Result {
		req.onWindow = func(hwnd uintptr) { go watchVisibility(hwnd, stop, &checks, &visible) }
		res := runEngine(req)
		close(stop)
		return res
	}
	res := solveFromArgs(os.Args[2:])
	if path := os.Getenv(windowReportEnv); path != "" {
		_ = os.WriteFile(path, []byte(fmt.Sprintf("%d %d", checks.Load(), visible.Load())), 0o600)
	}
	exitWithResult(res)
}

// engineTeardownBudget bounds only the observation of a teardown the child's job object
// enforces: closing it kills every browser process the child spawned. The earlier fixture drove
// runEngine in this process and waited 60s for browsers to leave on their own, a mechanism
// production never relies on and Windows does not bound, so a loaded gate could still see one
// alive. A budget here tolerates slow process enumeration; a job that never kills keeps the
// count above zero however long the wait.
const engineTeardownBudget = 10 * time.Second

// readWindowReport reads the checks and visible counts the real-engine solver child recorded
// for its host window.
func readWindowReport(t *testing.T, path string) (checks, visible int32) {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("solver child recorded no window report: %v", err)
	}
	counts := strings.Fields(string(raw))
	if len(counts) != 2 {
		t.Fatalf("window report %q", raw)
	}
	checks, err = parseReportCount(counts[0])
	if err != nil {
		t.Fatalf("window report %q: %v", raw, err)
	}
	visible, err = parseReportCount(counts[1])
	if err != nil {
		t.Fatalf("window report %q: %v", raw, err)
	}
	return checks, visible
}

// parseReportCount parses one counter of the window report.
func parseReportCount(field string) (int32, error) {
	n, err := strconv.ParseInt(field, 10, 32)
	return int32(n), err
}

// watchVisibility polls IsWindowVisible on hwnd until stop closes, counting every check and
// every time the window reported visible.
func watchVisibility(hwnd uintptr, stop <-chan struct{}, checks, sawVisible *atomic.Int32) {
	for {
		select {
		case <-stop:
			return
		case <-time.After(25 * time.Millisecond):
			checks.Add(1)
			if windowVisible(hwnd) {
				sawVisible.Add(1)
			}
		}
	}
}

// browserProcessesUsing counts the msedgewebview2 processes whose command line names dataDir,
// polling until none is left or budget passes, and returns the last count.
func browserProcessesUsing(t *testing.T, dataDir string, budget time.Duration) int {
	t.Helper()
	script := `@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | ` +
		`Where-Object { $_.CommandLine -ne $null -and $_.CommandLine.Contains('` + dataDir + `') }).Count`
	deadline := time.Now().Add(budget)
	for {
		out, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).Output()
		if err != nil {
			t.Fatalf("process listing: %v", err)
		}
		n, err := strconv.Atoi(strings.TrimSpace(string(out)))
		if err != nil {
			t.Fatalf("process listing output %q", out)
		}
		if n == 0 || time.Now().After(deadline) {
			return n
		}
		time.Sleep(500 * time.Millisecond)
	}
}
