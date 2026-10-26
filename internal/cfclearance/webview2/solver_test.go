package webview2

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/cfclearance"
)

const (
	// fakeChildEnv selects how the test binary behaves when it is launched as the solver child.
	fakeChildEnv = "CFCLEARANCE_FAKE_CHILD"
	// pidFileEnv names the file where a hanging fake child records its own PID and, when it
	// spawned one, its grandchild's PID, one per line.
	pidFileEnv = "CFCLEARANCE_FAKE_PIDFILE"
	// engineChildMode makes the child harness run the real engine instead of a fake one.
	engineChildMode = "real"
	// windowReportEnv names the file where the real-engine child records how often it checked
	// its host window's visibility and how often it saw it visible.
	windowReportEnv = "CFCLEARANCE_WINDOW_REPORT"
)

func TestMain(m *testing.M) {
	if mode := os.Getenv(fakeChildEnv); mode != "" && len(os.Args) > 1 && os.Args[1] == SolveFlag {
		runFakeChild(mode)
	}
	os.Exit(m.Run())
}

// runFakeChild plays the solver child: raw stdout shapes end the process directly, every
// other mode goes through RunSolverIfRequested with a fake engine, exactly like production.
func runFakeChild(mode string) {
	fmt.Println("[WebView2] Environment created successfully") // engine noise on stdout
	switch mode {
	case "noline":
		os.Exit(0)
	case "malformed":
		fmt.Println(Marker + "{")
		os.Exit(0)
	case "hang":
		writePIDs(os.Getpid())
		time.Sleep(time.Minute)
	case "grandchild":
		gc := exec.Command("cmd", "/c", "ping -n 60 127.0.0.1 >nul")
		gc.Stdout = os.Stdout // the grandchild holds the parent's pipe, as a browser would
		if err := gc.Start(); err != nil {
			os.Exit(2)
		}
		writePIDs(os.Getpid(), gc.Process.Pid)
		_ = gc.Wait()
	case engineChildMode:
		runRealEngineChild() // ends the child process
	}
	engine = fakeEngine(mode)
	RunSolverIfRequested(os.Args)
}

// fakeEngine answers like an engine would for mode: "ok" clears, "error" fails.
func fakeEngine(mode string) func(engineRequest) Result {
	return func(req engineRequest) Result {
		if mode == "error" {
			return Result{Error: "timed out waiting for the challenge to clear"}
		}
		return Result{
			UserAgent: "UA " + strings.Join([]string{req.origin, req.rejected, req.dataDir, req.budget.String()}, "|"),
			Cookies: []Cookie{
				{Name: "cf_clearance", Value: "v", Domain: ".jkanime.net", Path: "/", Expires: 1824263637.7, Secure: true, HTTPOnly: true},
				{Name: "tmp", Value: "s", Expires: -1},
			},
		}
	}
}

// writePIDs records pids for the test that launched this child.
func writePIDs(pids ...int) {
	lines := make([]string, 0, len(pids))
	for _, pid := range pids {
		lines = append(lines, strconv.Itoa(pid))
	}
	_ = os.WriteFile(os.Getenv(pidFileEnv), []byte(strings.Join(lines, "\n")), 0o600)
}

// requireWindows skips a test that needs the Windows child launcher.
func requireWindows(t *testing.T) {
	t.Helper()
	if runtime.GOOS != "windows" {
		t.Skip("solver children run on Windows only")
	}
}

// solveWithFakeChild runs one solve through the test binary acting as the child in mode.
func solveWithFakeChild(t *testing.T, ctx context.Context, mode, rejected string) (cfclearance.Clearance, error) {
	t.Helper()
	requireWindows(t)
	t.Setenv(fakeChildEnv, mode)
	t.Setenv(pidFileEnv, filepath.Join(t.TempDir(), "pids"))
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	s := &ProcessSolver{Executable: exe, DataDir: filepath.Join(t.TempDir(), "profile"), Timeout: 3 * time.Second}
	return s.Solve(ctx, "https://jkanime.net", rejected)
}

func TestProcessSolverReadsTheChildClearancePastEngineNoise(t *testing.T) {
	got, err := solveWithFakeChild(t, context.Background(), "ok", "old")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(got.UserAgent, "UA https://jkanime.net|old|") || !strings.HasSuffix(got.UserAgent, "|3s") {
		t.Fatalf("child args not forwarded: %q", got.UserAgent)
	}
	c := got.Cookies[0]
	if c.Name != "cf_clearance" || c.Value != "v" || c.Domain != ".jkanime.net" || !c.Secure || !c.HttpOnly ||
		!c.Expires.Equal(time.Unix(1824263637, 0)) || !got.Cookies[1].Expires.IsZero() {
		t.Fatalf("cookies = %+v, %+v", c, got.Cookies[1])
	}
}

func TestProcessSolverSurfacesChildFailures(t *testing.T) {
	for mode, want := range map[string]error{
		"error":     errChildFailed,
		"noline":    errNoLine,
		"malformed": errMalformed,
	} {
		t.Run(mode, func(t *testing.T) {
			if _, err := solveWithFakeChild(t, context.Background(), mode, "old"); !errors.Is(err, want) {
				t.Fatalf("err = %v, want %v", err, want)
			}
		})
	}
}

func TestProcessSolverKillsAHangingChildAndItsGrandchildOnTimeout(t *testing.T) {
	for _, mode := range []string{"hang", "grandchild"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
			defer cancel()
			_, err := solveWithFakeChild(t, ctx, mode, "")
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("err = %v, want the deadline", err)
			}
			for _, pid := range readPIDs(t) {
				if stillAlive(t, pid) {
					t.Fatalf("process %d survived the solver timeout", pid)
				}
			}
		})
	}
}

// readPIDs returns the PIDs the fake child recorded, failing when it recorded none.
func readPIDs(t *testing.T) []int {
	t.Helper()
	raw, err := os.ReadFile(os.Getenv(pidFileEnv))
	if err != nil {
		t.Fatalf("fake child recorded no PID: %v", err)
	}
	var pids []int
	for line := range strings.SplitSeq(strings.TrimSpace(string(raw)), "\n") {
		pid, err := strconv.Atoi(line)
		if err != nil {
			t.Fatalf("pid file line %q", line)
		}
		pids = append(pids, pid)
	}
	return pids
}

// stillAlive polls for up to two seconds and reports whether pid is still running then.
func stillAlive(t *testing.T, pid int) bool {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for processAlive(pid) {
		if time.Now().After(deadline) {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

func TestRunSolverIfRequestedIgnoresOrdinaryLaunches(t *testing.T) {
	for _, args := range [][]string{{"app.exe"}, {"app.exe", "--other"}, {}} {
		RunSolverIfRequested(args) // must return, not exit
	}
}

func TestSolveFromArgsRejectsABadCommandLine(t *testing.T) {
	for name, args := range map[string][]string{
		"wrong count": {"https://a.net", "old"},
		"bad timeout": {"https://a.net", "old", t.TempDir(), "soon"},
	} {
		t.Run(name, func(t *testing.T) {
			if res := solveFromArgs(args); res.Error == "" || res.UserAgent != "" {
				t.Fatalf("result = %+v, want an error only", res)
			}
		})
	}
}

func TestSolveFromArgsReportsAnEnginePanic(t *testing.T) {
	defer func(prev func(engineRequest) Result) { engine = prev }(engine)
	engine = func(engineRequest) Result { panic("boom") }
	if res := solveFromArgs([]string{"https://a.net", "", t.TempDir(), "1s"}); !strings.Contains(res.Error, "boom") {
		t.Fatalf("result = %+v, want the panic reported", res)
	}
}

func TestBoundedWriterKeepsTheFirstBytesOnly(t *testing.T) {
	w := &boundedWriter{limit: 4}
	for _, chunk := range []string{"ab", "cdef", "gh"} {
		if n, err := w.Write([]byte(chunk)); n != len(chunk) || err != nil {
			t.Fatalf("Write(%q) = %d, %v", chunk, n, err)
		}
	}
	if got := string(w.Bytes()); got != "abcd" {
		t.Fatalf("kept %q", got)
	}
}

func TestProcessSolverIsUnsupportedWithoutAnEngine(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows has an engine")
	}
	s := &ProcessSolver{Executable: "unused", DataDir: t.TempDir()}
	if _, err := s.Solve(context.Background(), "https://a.net", ""); !errors.Is(err, cfclearance.ErrUnsupported) {
		t.Fatalf("err = %v, want ErrUnsupported", err)
	}
}
