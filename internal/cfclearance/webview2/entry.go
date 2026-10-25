package webview2

import (
	"fmt"
	"os"
	"time"
)

// SolveFlag is the argument that turns this executable into a one-shot, windowless solver
// child. The engine runs out of process so a browser-engine failure can never take the
// application down with it.
const SolveFlag = "--cfclearance-solve"

// engineRequest is one solve as the child receives it on its command line.
type engineRequest struct {
	origin   string
	rejected string
	dataDir  string
	budget   time.Duration
	// fatal is called when the engine library hits an unrecoverable error; it must not return
	// in production, where it reports the failure on the protocol and ends the child. Nil lets
	// the library end the process itself.
	fatal func(error)
	// onWindow observes the never-shown host window once it exists; nil ignores it.
	onWindow func(hwnd uintptr)
}

// engine runs one solve in the browser engine; tests swap it for a fake child engine.
var engine = runEngine

// RunSolverIfRequested runs the solver child and ends the process when args carry SolveFlag;
// otherwise it returns at once. Call it first in main, before any UI or single-instance lock
// starts. Every engine failure is reported inside the protocol line, never as a crash.
func RunSolverIfRequested(args []string) {
	if len(args) < 2 || args[1] != SolveFlag {
		return
	}
	exitWithResult(solveFromArgs(args[2:]))
}

// exitWithResult prints the one protocol line and ends the child successfully.
func exitWithResult(res Result) {
	_, _ = fmt.Fprintln(os.Stdout, Encode(res))
	os.Exit(0)
}

// solveFromArgs validates "<origin> <rejected> <dataDir> <timeout>" and runs the engine,
// turning a panic in the engine into a reported failure.
func solveFromArgs(args []string) (res Result) {
	if len(args) != 4 {
		return Result{Error: "usage: " + SolveFlag + " <origin> <rejected> <dataDir> <timeout>"}
	}
	budget, err := time.ParseDuration(args[3])
	if err != nil {
		return Result{Error: "invalid timeout: " + err.Error()}
	}
	defer func() {
		if r := recover(); r != nil {
			res = Result{Error: fmt.Sprint("engine panic: ", r)}
		}
	}()
	return engine(engineRequest{
		origin: args[0], rejected: args[1], dataDir: args[2], budget: budget,
		fatal: func(err error) { exitWithResult(Result{Error: "engine failure: " + err.Error()}) },
	})
}
