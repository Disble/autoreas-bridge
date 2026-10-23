//go:build windows

package webview2

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// TestEngineClearsAFixtureCookieWithoutShowingAWindow runs the real engine against a local
// page that sets cf_clearance from JavaScript, the way a cleared challenge does. It skips only
// when the WebView2 runtime is genuinely absent.
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

	var sawVisible, checks atomic.Int32
	stop := make(chan struct{})
	res := runEngine(engineRequest{
		origin: srv.URL, rejected: "stale", dataDir: dataDir, budget: 20 * time.Second,
		onWindow: func(hwnd uintptr) { go watchVisibility(hwnd, stop, &checks, &sawVisible) },
	})
	close(stop)
	if strings.HasPrefix(res.Error, runtimeUnavailable) {
		t.Skip(res.Error)
	}
	if res.Error != "" {
		t.Fatal(res.Error)
	}
	got, err := Decode([]byte(Encode(res)), "stale")
	if err != nil {
		t.Fatal(err)
	}
	if got.Cookies[0].Value != "fixture-"+nonce {
		t.Fatalf("cookie = %+v, want the fixture value", got.Cookies[0])
	}
	t.Logf("user agent: %q", got.UserAgent)
	if checks.Load() == 0 || sawVisible.Load() != 0 {
		t.Fatalf("window visibility: %d checks, visible %d times", checks.Load(), sawVisible.Load())
	}
	started := time.Now()
	if n := browserProcessesUsing(t, dataDir, engineTeardownBudget); n != 0 {
		t.Fatalf("%d msedgewebview2 process(es) still use %s after %s", n, dataDir, engineTeardownBudget)
	}
	t.Logf("engine teardown took %s", time.Since(started).Round(time.Millisecond))
}

// engineTeardownBudget bounds how long the fixture waits for the browser processes to
// leave after the controller closed. In production the solver child exits and its job
// object kills them at once; here the engine runs in-process, so Close is asynchronous
// and its latency grows with machine load (the pre-commit gate runs this test beside
// every other package with -p 4). An engine that is not torn down (host window kept and
// controller left open) still fails: its processes never leave. Closing the controller
// alone is belt-and-braces: destroying the host window already ends the engine.
const engineTeardownBudget = 60 * time.Second

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
