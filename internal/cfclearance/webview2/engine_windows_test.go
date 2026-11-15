//go:build windows

package webview2

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"autoreas-bridge/internal/cfclearance"
)

// TestEngineClearsAFixtureCookieWithoutShowingAWindow runs the real engine behind the
// production boundary: a solver child, confined to a kill-on-close job, solves the fixture and
// reports the clearance on the protocol. Every browser process the engine starts runs inside
// that job, so closing the job ends them all. It skips only when the WebView2 runtime is
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
	t.Cleanup(func() { removeProfileUnlessFailed(t, dataDir) })
	report := filepath.Join(t.TempDir(), "window")
	t.Setenv(fakeChildEnv, engineChildMode)
	t.Setenv(windowReportEnv, report)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	got, inside, outside := solveInWatchedJob(t, exe, srv.URL, dataDir)
	assertFixtureClearance(t, got, nonce)
	if checks, visible := readWindowReport(t, report); checks == 0 || visible != 0 {
		t.Fatalf("window visibility: %d checks, visible %d times", checks, visible)
	}
	if outside != 0 {
		t.Fatalf("%d msedgewebview2 process(es) using %s ran outside the kill-on-close job", outside, dataDir)
	}
	if inside == 0 {
		t.Fatalf("no msedgewebview2 process using %s was seen during the solve", dataDir)
	}
	t.Logf("%d browser processes, all inside the job", inside)
}

// solveInWatchedJob runs the solver child for origin inside a kill-on-close job the fixture
// owns, and returns the decoded clearance with how many browser processes using dataDir ran
// inside and outside that job. It skips the test when the WebView2 runtime is absent.
func solveInWatchedJob(t *testing.T, exe, origin, dataDir string) (got cfclearance.Clearance, inside, outside int) {
	t.Helper()
	job, err := newKillOnCloseJob()
	if err != nil {
		t.Fatal(err)
	}
	defer job.close()
	watch := watchJobMembership(job.handle, dataDir)
	budget := 20 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), budget+shutdownGrace)
	defer cancel()
	stdout := &boundedWriter{limit: MaxOutputBytes}
	runErr := runChildInJob(ctx, job, exe, []string{SolveFlag, origin, "stale", dataDir, budget.String()}, stdout)
	inside, outside = watch.stop(t)
	clearance, err := Decode(stdout.Bytes(), "stale")
	if err != nil && strings.Contains(err.Error(), runtimeUnavailable) {
		t.Skip(err)
	}
	if err != nil {
		t.Fatal(errors.Join(err, runErr))
	}
	return clearance, inside, outside
}

// assertFixtureClearance fails unless got carries the fixture's cf_clearance for nonce and the
// engine's user agent.
func assertFixtureClearance(t *testing.T, got cfclearance.Clearance, nonce string) {
	t.Helper()
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

// removeProfileUnlessFailed deletes the fixture's engine profile, or keeps it and logs its path
// when the test failed so the profile can be inspected. The browsers release the profile's
// files as they exit, so the delete retries for up to profileRemovalBudget.
func removeProfileUnlessFailed(t *testing.T, dataDir string) {
	if t.Failed() {
		t.Logf("engine profile kept for inspection: %s", dataDir)
		return
	}
	deadline := time.Now().Add(profileRemovalBudget)
	for {
		err := os.RemoveAll(dataDir)
		if err == nil {
			return
		}
		if time.Now().After(deadline) {
			t.Logf("engine profile %s not removed: %v", dataDir, err)
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// profileRemovalBudget bounds how long the fixture retries deleting its engine profile.
const profileRemovalBudget = 15 * time.Second

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

// jobWatch records, while a solve runs, which msedgewebview2 processes using the fixture's
// profile ran inside the solver child's job and which ran outside it.
type jobWatch struct {
	done     chan struct{}
	finished chan struct{}
	inside   map[uint32]bool
	outside  map[uint32]bool
	err      error
}

// watchJobMembership looks every 20ms, until stop, for msedgewebview2 processes whose command
// line names dataDir and records whether each one is a member of job.
func watchJobMembership(job windows.Handle, dataDir string) *jobWatch {
	w := &jobWatch{done: make(chan struct{}), finished: make(chan struct{}), inside: map[uint32]bool{}, outside: map[uint32]bool{}}
	go func() {
		defer close(w.finished)
		for {
			if w.err = w.look(job, dataDir); w.err != nil {
				return
			}
			select {
			case <-w.done:
				return
			case <-time.After(20 * time.Millisecond):
			}
		}
	}()
	return w
}

// look classifies each browser process using dataDir that has not been classified yet.
func (w *jobWatch) look(job windows.Handle, dataDir string) error {
	pids, err := browserProcessIDs()
	if err != nil {
		return err
	}
	for _, pid := range pids {
		if w.inside[pid] || w.outside[pid] {
			continue
		}
		h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
		if err != nil {
			continue // exited since the snapshot, or not ours to open
		}
		member, err := classifyBrowserProcess(h, job, dataDir)
		_ = windows.CloseHandle(h)
		switch {
		case err != nil:
			return err
		case member == nil:
		case *member:
			w.inside[pid] = true
		default:
			w.outside[pid] = true
		}
	}
	return nil
}

// stop ends the watch and returns how many browser processes ran inside and outside the job.
func (w *jobWatch) stop(t *testing.T) (inside, outside int) {
	t.Helper()
	close(w.done)
	<-w.finished
	if w.err != nil {
		t.Fatalf("watch browser processes: %v", w.err)
	}
	return len(w.inside), len(w.outside)
}

// browserProcessIDs lists the IDs of the running msedgewebview2 processes.
func browserProcessIDs() ([]uint32, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, fmt.Errorf("process snapshot: %w", err)
	}
	defer func() { _ = windows.CloseHandle(snapshot) }()
	var pids []uint32
	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	for err = windows.Process32First(snapshot, &entry); err == nil; err = windows.Process32Next(snapshot, &entry) {
		if strings.EqualFold(windows.UTF16ToString(entry.ExeFile[:]), "msedgewebview2.exe") {
			pids = append(pids, entry.ProcessID)
		}
	}
	return pids, nil
}

// procIsProcessInJob is kernel32's IsProcessInJob, which golang.org/x/sys/windows does not wrap.
var procIsProcessInJob = windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessInJob")

// classifyBrowserProcess reports whether the process behind h is a member of job, or nil when
// its command line does not name dataDir.
func classifyBrowserProcess(h, job windows.Handle, dataDir string) (*bool, error) {
	if !strings.Contains(processCommandLine(h), dataDir) {
		return nil, nil
	}
	var member int32
	if ok, _, err := procIsProcessInJob.Call(uintptr(h), uintptr(job), uintptr(unsafe.Pointer(&member))); ok == 0 {
		return nil, fmt.Errorf("IsProcessInJob: %w", err)
	}
	in := member != 0
	return &in, nil
}

// processCommandLine reads a process's command line, or "" when it cannot be read.
func processCommandLine(h windows.Handle) string {
	buf := make([]byte, 64<<10)
	var n uint32
	if err := windows.NtQueryInformationProcess(h, windows.ProcessCommandLineInformation,
		unsafe.Pointer(&buf[0]), uint32(len(buf)), &n); err != nil {
		return ""
	}
	return (*windows.NTUnicodeString)(unsafe.Pointer(&buf[0])).String()
}
