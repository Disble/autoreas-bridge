package notice

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/identity"
)

// fixedIdentifier states a decision the real algorithm cannot produce today: a file named while the
// decision flags its own ambiguity. Over the 20 curated corpora cases and every crafted entry set
// tried, ambiguity appears only where the algorithm ABSTAINS, so the confidence gate's refusal has no
// real input to run against; stating the input is the only way to observe that refusal.
type fixedIdentifier struct{ result identity.Result }

// Identify returns the stated decision and ignores the request.
func (f fixedIdentifier) Identify(identity.Request) identity.Result { return f.result }

func TestTodayMarksRefusesADecisionThatFlagsItsOwnAmbiguity(t *testing.T) {
	t.Parallel()

	coordinator := newCoordinator(t, &proberAnswers{runtime: 45 * time.Minute}, &notifierRecords{})
	coordinator.identifier = fixedIdentifier{result: identity.Result{
		Next:        &identity.Selection{Episode: 2, Basename: "Show - 02.mp4"},
		Basis:       identity.BasisDirectNumber,
		Diagnostics: []identity.Diagnostic{{Kind: identity.DiagnosticAmbiguity}},
	}}

	marks := coordinator.TodayMarks(context.Background(), []TodayEpisode{
		episodeRow(folderWith(t, "Show - 02.mp4"), tv(), 1),
	})

	if len(marks) != 1 || marks[0] {
		t.Fatalf("a decision that flags its own doubt must not be marked: %v", marks)
	}
}

func TestHasAmbiguityReadsTheWholeFactSet(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name        string
		diagnostics []identity.Diagnostic
		want        bool
	}{
		{name: "no diagnostics at all", want: false},
		{name: "another kind of doubt is not ambiguity",
			diagnostics: []identity.Diagnostic{{Kind: identity.DiagnosticInversion}}, want: false},
		{name: "unusable context is not ambiguity",
			diagnostics: []identity.Diagnostic{{Kind: identity.DiagnosticUnusableContext}}, want: false},
		{name: "an ambiguity is found",
			diagnostics: []identity.Diagnostic{{Kind: identity.DiagnosticAmbiguity}}, want: true},
		{name: "an ambiguity behind another kind is still found",
			diagnostics: []identity.Diagnostic{{Kind: identity.DiagnosticInversion}, {Kind: identity.DiagnosticAmbiguity}},
			want:        true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := hasAmbiguity(tc.diagnostics); got != tc.want {
				t.Errorf("want %v, got %v", tc.want, got)
			}
		})
	}
}

// probesInFlightBound is the bound the scope promises, written as a literal on purpose: a test that
// expects maxProbesInFlight cannot see that constant change.
const probesInFlightBound = 4

// gatedProber admits a probe, announces it, and then waits for the test to open the gate. Holding every
// admitted probe makes the bound deterministic: while the gate is shut, no probe can finish, so the
// pool cannot admit one more than it is allowed.
type gatedProber struct {
	arrival chan string
	gate    chan struct{}

	mu      sync.Mutex
	running int
	highest int
	admits  int
}

// newGatedProber returns a prober with a shut gate and room for the arrivals a test expects.
func newGatedProber() *gatedProber {
	return &gatedProber{arrival: make(chan string, 64), gate: make(chan struct{})}
}

func (p *gatedProber) Probe(ctx context.Context, path string) (time.Duration, error) {
	p.mu.Lock()
	p.running++
	p.admits++
	if p.running > p.highest {
		p.highest = p.running
	}
	p.mu.Unlock()

	p.arrival <- path

	select {
	case <-p.gate:
	case <-ctx.Done():
		return 0, ctx.Err()
	}

	p.mu.Lock()
	p.running--
	p.mu.Unlock()
	return 45 * time.Minute, nil
}

// open lets every admitted probe finish.
func (p *gatedProber) open() {
	close(p.gate)
}

// stats returns the highest number of probes seen at once and how many were admitted in total.
func (p *gatedProber) stats() (highest, admits int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.highest, p.admits
}

// perFileRuntime answers by the file it was handed, so two rows in one call can disagree.
type perFileRuntime struct {
	long     time.Duration
	ordinary time.Duration
}

func (p *perFileRuntime) Probe(_ context.Context, path string) (time.Duration, error) {
	if strings.HasPrefix(filepath.Base(path), "Long") {
		return p.long, nil
	}
	return p.ordinary, nil
}

// episodeRow is one anime of the day as the coordination receives it.
func episodeRow(folder string, kind *int, progress float64) TodayEpisode {
	return TodayEpisode{Folder: folder, Kind: kind, Progress: progress}
}

func TestTodayMarksMarksOnlyALongNextEpisode(t *testing.T) {
	t.Parallel()

	notTV := 3
	twoEpisodes := func(t *testing.T) string { return folderWith(t, "Show - 01.mp4", "Show - 02.mp4") }

	for _, tc := range []struct {
		name       string
		folder     func(*testing.T) string
		kind       *int
		progress   float64
		prober     *proberAnswers
		want       bool
		wantProbes int
	}{
		{name: "a long next episode is marked", folder: twoEpisodes, kind: tv(), progress: 1,
			prober: &proberAnswers{runtime: 45 * time.Minute}, want: true, wantProbes: 1},
		{name: "an ordinary next episode is not marked", folder: twoEpisodes, kind: tv(), progress: 1,
			prober: &proberAnswers{runtime: 24 * time.Minute}, wantProbes: 1},
		{name: "a short next episode is not marked", folder: twoEpisodes, kind: tv(), progress: 1,
			prober: &proberAnswers{runtime: 12 * time.Minute}, wantProbes: 1},
		{name: "an anime that is not TV is never measured", folder: twoEpisodes, kind: &notTV, progress: 1,
			prober: &proberAnswers{runtime: 45 * time.Minute}},
		{name: "an anime with no stored type is never measured", folder: twoEpisodes, kind: nil, progress: 1,
			prober: &proberAnswers{runtime: 45 * time.Minute}},
		{name: "a folder nobody can read is not marked",
			folder: func(t *testing.T) string { return filepath.Join(t.TempDir(), "gone") },
			kind:   tv(), progress: 1, prober: &proberAnswers{runtime: 45 * time.Minute}},
		{name: "a folder with no media is not marked", folder: func(t *testing.T) string { return t.TempDir() },
			kind: tv(), progress: 1, prober: &proberAnswers{runtime: 45 * time.Minute}},
		{name: "a probe that cannot read the file is not marked", folder: twoEpisodes, kind: tv(), progress: 1,
			prober: &proberAnswers{err: errors.New("ffprobe: not found")}, wantProbes: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			marks := newCoordinator(t, tc.prober, &notifierRecords{}).
				TodayMarks(context.Background(), []TodayEpisode{
					episodeRow(tc.folder(t), tc.kind, tc.progress),
				})

			if len(marks) != 1 || marks[0] != tc.want {
				t.Fatalf("want [%v], got %v", tc.want, marks)
			}
			if len(tc.prober.paths) != tc.wantProbes {
				t.Errorf("want %d probes, got %d (%v)", tc.wantProbes, len(tc.prober.paths), tc.prober.paths)
			}
		})
	}
}

func TestTodayMarksKeepsOneMarkPerRowInOrder(t *testing.T) {
	t.Parallel()

	long := folderWith(t, "Long - 01.mp4", "Long - 02.mp4")
	ordinary := folderWith(t, "Short - 01.mp4", "Short - 02.mp4")
	unreadable := filepath.Join(t.TempDir(), "gone")

	for _, tc := range []struct {
		name string
		rows []TodayEpisode
		want []bool
	}{
		{name: "the long row is the first one",
			rows: []TodayEpisode{episodeRow(long, tv(), 1), episodeRow(ordinary, tv(), 1), episodeRow(unreadable, tv(), 1)},
			want: []bool{true, false, false}},
		{name: "the long row is the last one",
			rows: []TodayEpisode{episodeRow(unreadable, tv(), 1), episodeRow(ordinary, tv(), 1), episodeRow(long, tv(), 1)},
			want: []bool{false, false, true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			prober := &perFileRuntime{long: 45 * time.Minute, ordinary: 24 * time.Minute}
			marks := newCoordinator(t, prober, &notifierRecords{}).TodayMarks(context.Background(), tc.rows)

			if len(marks) != len(tc.want) {
				t.Fatalf("one mark per row: want %d, got %d", len(tc.want), len(marks))
			}
			for index, want := range tc.want {
				if marks[index] != want {
					t.Errorf("row %d: want %v, got %v (all marks %v)", index, want, marks[index], marks)
				}
			}
		})
	}
}

func TestTodayMarksHoldsTheBoundAndMeasuresEveryRow(t *testing.T) {
	t.Parallel()

	rows := make([]TodayEpisode, 0, 8)
	for i := 0; i < 8; i++ {
		rows = append(rows, episodeRow(folderWith(t, "Show - 01.mp4", "Show - 02.mp4"), tv(), 1))
	}

	prober := newGatedProber()
	coordinator := newCoordinator(t, prober, &notifierRecords{})
	done := make(chan []bool, 1)
	go func() { done <- coordinator.TodayMarks(context.Background(), rows) }()

	// Every slot is taken and none is exceeded: a bound of five would announce a fifth probe here, and
	// a bound of three could not announce the fourth.
	for admitted := 0; admitted < probesInFlightBound; admitted++ {
		select {
		case <-prober.arrival:
		case <-time.After(2 * time.Second):
			t.Fatalf("only %d probes were admitted, the bound admits %d", admitted, probesInFlightBound)
		}
	}
	select {
	case <-prober.arrival:
		t.Fatalf("a probe was admitted past the bound of %d", probesInFlightBound)
	case <-time.After(150 * time.Millisecond):
	}

	prober.open()

	marks := <-done
	for index, mark := range marks {
		if !mark {
			t.Fatalf("every row must be measured, row %d was not: %v", index, marks)
		}
	}
	if highest, admits := prober.stats(); highest != probesInFlightBound || admits != len(rows) {
		t.Errorf("want %d in flight and %d admitted, got %d and %d",
			probesInFlightBound, len(rows), highest, admits)
	}
}
