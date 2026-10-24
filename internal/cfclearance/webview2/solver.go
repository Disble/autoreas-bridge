package webview2

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"autoreas-bridge/internal/cfclearance"
)

const (
	// defaultTimeout is the solve budget when neither Timeout nor the context bounds it.
	defaultTimeout = 30 * time.Second
	// shutdownGrace is the extra time the child gets to report and tear its browser down
	// before the parent kills it.
	shutdownGrace = 5 * time.Second
	// waitDelay bounds how long the parent waits for the child's stdout pipe to close after
	// the child ended, in case a browser process it spawned still holds it.
	waitDelay = 2 * time.Second
)

// ProcessSolver clears challenges by running the application's own executable again as a
// windowless solver child. It implements cfclearance.Solver.
type ProcessSolver struct {
	// DataDir is the engine's persistent profile folder, so a clearance survives restarts.
	DataDir string
	// Executable is the binary to launch; empty means the running executable.
	Executable string
	// Timeout is the child's solve budget; zero means defaultTimeout. A shorter context
	// deadline wins.
	Timeout time.Duration

	mu sync.Mutex // one child at a time: the engine profile admits one browser
}

// Solve runs one solver child and returns the clearance it reported. A child that is killed
// by the context reports the context's error; one that reports nothing usable reports why.
// On platforms without an engine it returns cfclearance.ErrUnsupported.
func (s *ProcessSolver) Solve(ctx context.Context, origin, rejected string) (cfclearance.Clearance, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	exe, err := s.executable()
	if err != nil {
		return cfclearance.Clearance{}, err
	}
	if err := os.MkdirAll(s.DataDir, 0o700); err != nil {
		return cfclearance.Clearance{}, fmt.Errorf("cfclearance webview2: engine profile: %w", err)
	}
	budget := s.budget(ctx)
	ctx, cancel := context.WithTimeout(ctx, budget+shutdownGrace)
	defer cancel()
	stdout := &boundedWriter{limit: MaxOutputBytes}
	runErr := runChild(ctx, exe, []string{SolveFlag, origin, rejected, s.DataDir, budget.String()}, stdout)
	switch {
	case errors.Is(runErr, cfclearance.ErrUnsupported):
		return cfclearance.Clearance{}, runErr
	case runErr != nil && ctx.Err() != nil:
		return cfclearance.Clearance{}, fmt.Errorf("cfclearance webview2: solver child killed: %w", ctx.Err())
	}
	got, err := Decode(stdout.Bytes(), rejected)
	if err != nil {
		return cfclearance.Clearance{}, errors.Join(err, runErr)
	}
	return got, nil
}

// executable resolves the child binary.
func (s *ProcessSolver) executable() (string, error) {
	if s.Executable != "" {
		return s.Executable, nil
	}
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("cfclearance webview2: locate executable: %w", err)
	}
	return exe, nil
}

// budget is the solve budget handed to the child: Timeout (or the default), capped by the
// context's remaining time.
func (s *ProcessSolver) budget(ctx context.Context) time.Duration {
	budget := s.Timeout
	if budget <= 0 {
		budget = defaultTimeout
	}
	if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) < budget {
		budget = max(time.Until(deadline), 0)
	}
	return budget
}

// boundedWriter keeps the first limit bytes of a child stream and drops the rest while still
// reporting a full write, so a chatty child is capped instead of blocked.
type boundedWriter struct {
	mu    sync.Mutex
	limit int
	buf   bytes.Buffer
}

// Write keeps what fits under the limit and discards the remainder.
func (b *boundedWriter) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if room := b.limit - b.buf.Len(); room > 0 {
		_, _ = b.buf.Write(p[:min(room, len(p))])
	}
	return len(p), nil
}

// Bytes returns what was kept so far.
func (b *boundedWriter) Bytes() []byte {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Bytes()
}
