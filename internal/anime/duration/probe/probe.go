// Package probe adapts ffprobe as the media duration probe for the
// episode-duration design (docs/episode-duration-notice.md section 3).
//
// The probe reads the runtime of exactly one file. It never lists folders
// and never filters extensions; that observation belongs to a separate
// component. Every failure — missing binary, non-zero exit, timeout,
// unparsable output, or a zero or negative reading — returns an error and
// never a fabricated duration, so callers degrade to Unavailable.
package probe

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os/exec"
	"strconv"
	"time"

	"autoreas-bridge/internal/anime/duration"
)

// DefaultBinaryPath is the ffprobe binary used when no explicit path is
// configured. ffprobe ships with ffmpeg and may be absent on end-user
// machines; a missing binary surfaces as a probe error, never as a guess.
const DefaultBinaryPath = "ffprobe"

// DefaultTimeout bounds one probe execution when no timeout is configured.
const DefaultTimeout = 30 * time.Second

// Prober obtains the runtime of one media file.
type Prober interface {
	// Probe returns the runtime of the file at path. Any failure returns a
	// non-nil error and no positive duration.
	Probe(ctx context.Context, path string) (time.Duration, error)
}

// FFProbe is the ffprobe-backed Prober. The zero value is usable and
// defaults to DefaultBinaryPath with DefaultTimeout.
type FFProbe struct {
	// BinaryPath is the ffprobe executable. Empty means DefaultBinaryPath.
	BinaryPath string
	// Timeout bounds one probe execution. Zero or negative means DefaultTimeout.
	Timeout time.Duration
}

// NewFFProbe returns an FFProbe using binaryPath, or DefaultBinaryPath when
// binaryPath is empty.
func NewFFProbe(binaryPath string) *FFProbe {
	return &FFProbe{BinaryPath: binaryPath}
}

// Probe runs ffprobe against exactly one file and parses its JSON report.
// The file path travels as a single process argument, never interpolated
// into a shell string. Context cancellation — including the timeout —
// aborts the run and returns an error.
func (p *FFProbe) Probe(ctx context.Context, path string) (time.Duration, error) {
	binary := p.BinaryPath
	if binary == "" {
		binary = DefaultBinaryPath
	}
	timeout := p.effectiveTimeout()

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, binary,
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "json",
		path,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("probe %q: %w", path, err)
	}

	runtime, err := parseDurationJSON(out)
	if err != nil {
		return 0, fmt.Errorf("probe %q: %w", path, err)
	}
	return runtime, nil
}

// effectiveTimeout resolves the bound for one probe execution: an explicit
// positive Timeout passes through untouched, while a zero or negative
// Timeout means DefaultTimeout.
func (p *FFProbe) effectiveTimeout() time.Duration {
	if p.Timeout <= 0 {
		return DefaultTimeout
	}
	return p.Timeout
}

// KindOf maps a probe outcome to the duration rule. A probe error yields
// KindUnavailable even when a duration came back with it: a failed reading
// must degrade, never guess.
func KindOf(runtime time.Duration, err error) duration.Kind {
	if err != nil {
		return duration.KindUnavailable
	}
	return duration.Classify(runtime)
}

// ffprobeReport is the subset of ffprobe JSON output the probe reads.
type ffprobeReport struct {
	Format struct {
		// Duration is seconds as a string, or "N/A" when ffprobe has no reading.
		Duration string `json:"duration"`
	} `json:"format"`
}

// parseDurationJSON extracts the runtime from ffprobe JSON output. Only a
// present, numeric, positive, finite duration is a reading; anything else is
// an error, never a zero duration masquerading as a short episode.
func parseDurationJSON(out []byte) (time.Duration, error) {
	var report ffprobeReport
	if err := json.Unmarshal(out, &report); err != nil {
		return 0, fmt.Errorf("parse ffprobe output: %w", err)
	}
	seconds, err := strconv.ParseFloat(report.Format.Duration, 64)
	if err != nil {
		return 0, fmt.Errorf("parse ffprobe duration %q: %w", report.Format.Duration, err)
	}
	if math.IsNaN(seconds) || math.IsInf(seconds, 0) {
		return 0, fmt.Errorf("parse ffprobe duration %q: not finite", report.Format.Duration)
	}
	if seconds <= 0 {
		return 0, fmt.Errorf("parse ffprobe duration %q: not positive", report.Format.Duration)
	}
	return time.Duration(seconds * float64(time.Second)), nil
}
