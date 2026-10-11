package probe

import (
	"context"
	"encoding/binary"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/duration"
)

// parseCase is one ffprobe JSON contract row: either a reading within a
// millisecond of expected, or an error with no fabricated duration.
type parseCase struct {
	name     string
	output   string
	expected time.Duration
	wantErr  bool
}

// assertParseDuration runs one parseCase row.
func assertParseDuration(t *testing.T, tc parseCase) {
	t.Helper()

	got, err := parseDurationJSON([]byte(tc.output))
	if tc.wantErr {
		if err == nil {
			t.Fatalf("parseDurationJSON(%q) = %v, want error", tc.output, got)
		}
		if got != 0 {
			t.Fatalf("parseDurationJSON(%q) = %v with error, want no fabricated duration", tc.output, got)
		}
		return
	}
	if err != nil {
		t.Fatalf("parseDurationJSON(%q) returned error: %v", tc.output, err)
	}
	if got < tc.expected-time.Millisecond || got > tc.expected+time.Millisecond {
		t.Fatalf("parseDurationJSON(%q) = %v, want %v", tc.output, got, tc.expected)
	}
}

// The parse table pins the ffprobe JSON contract: only a present, numeric,
// positive, finite format.duration is a reading. Anything else is an error,
// never a fabricated duration.
func TestParseDuration(t *testing.T) {
	t.Parallel()

	cases := []parseCase{
		{name: "ordinary episode runtime", output: `{"format": {"duration": "1432.040000"}}`, expected: 1432*time.Second + 40*time.Millisecond},
		{name: "whole seconds", output: `{"format": {"duration": "60.0"}}`, expected: time.Minute},
		{name: "missing format", output: `{}`, wantErr: true},
		{name: "missing duration", output: `{"format": {}}`, wantErr: true},
		{name: "unknown duration marker", output: `{"format": {"duration": "N/A"}}`, wantErr: true},
		{name: "zero duration", output: `{"format": {"duration": "0.000000"}}`, wantErr: true},
		{name: "negative duration", output: `{"format": {"duration": "-5.500000"}}`, wantErr: true},
		{name: "not a number", output: `{"format": {"duration": "NaN"}}`, wantErr: true},
		{name: "positive infinite duration", output: `{"format": {"duration": "+Inf"}}`, wantErr: true},
		{name: "negative infinite duration", output: `{"format": {"duration": "-Inf"}}`, wantErr: true},
		{name: "empty duration", output: `{"format": {"duration": ""}}`, wantErr: true},
		{name: "non-numeric duration", output: `{"format": {"duration": "fast"}}`, wantErr: true},
		{name: "invalid json", output: `not json`, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			assertParseDuration(t, tc)
		})
	}
}

// stubProber is the fake Prober: canned runtime or failure behind the real interface.
type stubProber struct {
	runtime time.Duration
	err     error
}

func (s stubProber) Probe(context.Context, string) (time.Duration, error) {
	return s.runtime, s.err
}

// The fake only proves the wiring if it really satisfies the interface.
var _ Prober = stubProber{}

// The fake pins the fail-closed wiring: a probe error degrades to Unavailable
// even when a duration came back with it, and a success classifies normally.
func TestKindOfWithFake(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		prober   Prober
		expected duration.Kind
	}{
		{name: "long runtime", prober: stubProber{runtime: 41 * time.Minute}, expected: duration.KindLong},
		{name: "normal runtime", prober: stubProber{runtime: 24 * time.Minute}, expected: duration.KindNormal},
		{name: "short runtime", prober: stubProber{runtime: time.Minute}, expected: duration.KindShort},
		{name: "probe failure", prober: stubProber{err: errors.New("boom")}, expected: duration.KindUnavailable},
		{name: "failure with runtime still unavailable", prober: stubProber{runtime: 41 * time.Minute, err: errors.New("boom")}, expected: duration.KindUnavailable},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			runtime, err := tc.prober.Probe(context.Background(), "episode-24.mp4")
			if got := KindOf(runtime, err); got != tc.expected {
				t.Fatalf("KindOf(%v, %v) = %v, want %v", runtime, err, got, tc.expected)
			}
		})
	}
}

// A missing binary is an error, never a fabricated duration.
func TestFFProbeMissingBinary(t *testing.T) {
	t.Parallel()

	prober := NewFFProbe("definitely-missing-ffprobe-binary")

	got, err := prober.Probe(context.Background(), "episode-24.mp4")
	if err == nil {
		t.Fatalf("Probe with missing binary = %v, want error", got)
	}
	if got != 0 {
		t.Fatalf("Probe with missing binary = %v, want no fabricated duration", got)
	}
}

// TestProbeDefaults documents the out-of-the-box probe configuration: the
// standard ffprobe binary with a bounded execution timeout.
func TestProbeDefaults(t *testing.T) {
	t.Parallel()

	if DefaultBinaryPath != "ffprobe" {
		t.Fatalf("DefaultBinaryPath = %q, want %q", DefaultBinaryPath, "ffprobe")
	}
	if DefaultTimeout != 30*time.Second {
		t.Fatalf("DefaultTimeout = %v, want %v", DefaultTimeout, 30*time.Second)
	}
}

// TestEffectiveTimeout pins timeout selection: an explicit positive Timeout
// passes through untouched, while a zero or negative Timeout means the default.
func TestEffectiveTimeout(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		timeout  time.Duration
		expected time.Duration
	}{
		{name: "zero means default", timeout: 0, expected: DefaultTimeout},
		{name: "negative means default", timeout: -time.Second, expected: DefaultTimeout},
		{name: "nanosecond timeout passes through", timeout: time.Nanosecond, expected: time.Nanosecond},
		{name: "explicit timeout passes through", timeout: 5 * time.Second, expected: 5 * time.Second},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			prober := &FFProbe{Timeout: tc.timeout}
			if got := prober.effectiveTimeout(); got != tc.expected {
				t.Fatalf("effectiveTimeout with Timeout=%v = %v, want %v", tc.timeout, got, tc.expected)
			}
		})
	}
}

// A cancelled context bounds execution instead of running the binary.
func TestFFProbeCanceledContext(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	prober := NewFFProbe("")

	if _, err := prober.Probe(ctx, "episode-24.mp4"); err == nil {
		t.Fatal("Probe with cancelled context returned nil error, want error")
	}
}

// ffprobe exits non-zero for a file it cannot read; that is an error.
func TestFFProbeNonexistentFile(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping ffprobe test in short mode")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("skipping ffprobe test: ffprobe not installed")
	}

	prober := NewFFProbe("")

	if _, err := prober.Probe(context.Background(), filepath.Join(t.TempDir(), "no-such-file.mp4")); err == nil {
		t.Fatal("Probe of nonexistent file returned nil error, want error")
	}
}

// TestFFProbeProbesWAVFile is the real-binary integration test: it generates a
// minimal one-second WAV with the stdlib, probes it with the installed
// ffprobe, and skips cleanly when ffprobe is absent.
func TestFFProbeProbesWAVFile(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping ffprobe test in short mode")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("skipping ffprobe test: ffprobe not installed")
	}

	path := writeWAV(t, 8000, time.Second)

	prober := NewFFProbe("")

	got, err := prober.Probe(context.Background(), path)
	if err != nil {
		t.Fatalf("Probe(%q) returned error: %v", path, err)
	}
	if got < 950*time.Millisecond || got > 1050*time.Millisecond {
		t.Fatalf("Probe(%q) = %v, want about 1s", path, got)
	}
	t.Logf("probed %q: duration=%v kind=%v", path, got, duration.Classify(got))
}

// TestFFProbeZeroLengthWAV pins the success-without-reading path: ffprobe
// accepts the file but reports no positive runtime, so the probe returns an
// error and never a fabricated duration.
func TestFFProbeZeroLengthWAV(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping ffprobe test in short mode")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("skipping ffprobe test: ffprobe not installed")
	}

	path := writeWAV(t, 8000, 0)

	prober := NewFFProbe("")

	got, err := prober.Probe(context.Background(), path)
	if err == nil {
		t.Fatalf("Probe(%q) = %v, want error for a file with no runtime", path, got)
	}
	if got != 0 {
		t.Fatalf("Probe(%q) = %v with error, want no fabricated duration", path, got)
	}
}

// TestProbeManualSampleFile is a manual verification hook, not CI coverage:
// when EPISODE_DURATION_SAMPLE names a real media file, it probes that file
// read-only with the production probe and reports the duration and Kind.
// Unset means skip.
func TestProbeManualSampleFile(t *testing.T) {
	path := os.Getenv("EPISODE_DURATION_SAMPLE")
	if path == "" {
		t.Skip("skipping manual probe: EPISODE_DURATION_SAMPLE is unset")
	}
	if testing.Short() {
		t.Skip("skipping ffprobe test in short mode")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("skipping ffprobe test: ffprobe not installed")
	}

	prober := NewFFProbe("")

	got, err := prober.Probe(context.Background(), path)
	if err != nil {
		t.Fatalf("Probe(%q) returned error: %v", path, err)
	}
	if got <= 0 {
		t.Fatalf("Probe(%q) = %v, want a positive duration", path, got)
	}
	t.Logf("probed %q: duration=%v kind=%v", path, got, duration.Classify(got))
}

// writeWAV writes a silent PCM WAV of the given length to a temporary file
// and returns its path. WAV keeps the integration test stdlib-only: no media
// generator is needed, and ffprobe reads the duration from the header.
func writeWAV(t *testing.T, sampleRate int, length time.Duration) string {
	t.Helper()

	const (
		channels      = 1
		bitsPerSample = 16
	)
	blockAlign := channels * bitsPerSample / 8
	byteRate := sampleRate * blockAlign
	samples := int(length.Seconds() * float64(sampleRate))
	dataLen := samples * blockAlign

	header := make([]byte, 44)
	copy(header[0:], "RIFF")
	binary.LittleEndian.PutUint32(header[4:], uint32(36+dataLen))
	copy(header[8:], "WAVE")
	copy(header[12:], "fmt ")
	binary.LittleEndian.PutUint32(header[16:], 16)
	binary.LittleEndian.PutUint16(header[20:], 1)
	binary.LittleEndian.PutUint16(header[22:], channels)
	binary.LittleEndian.PutUint32(header[24:], uint32(sampleRate))
	binary.LittleEndian.PutUint32(header[28:], uint32(byteRate))
	binary.LittleEndian.PutUint16(header[32:], uint16(blockAlign))
	binary.LittleEndian.PutUint16(header[34:], bitsPerSample)
	copy(header[36:], "data")
	binary.LittleEndian.PutUint32(header[40:], uint32(dataLen))

	path := filepath.Join(t.TempDir(), "sample.wav")
	content := append(header, make([]byte, dataLen)...)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatalf("write WAV fixture: %v", err)
	}
	return path
}
