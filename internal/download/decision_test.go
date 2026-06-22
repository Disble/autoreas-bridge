package download

import (
	"errors"
	"testing"
)

// TestNeedsDownloadTriggersWhenOnlineLatestExceedsDiskCount covers download-orchestration
// spec "Online-vs-Disk Trigger Semantic" / Scenario "More episodes online than on disk".
func TestNeedsDownloadTriggersWhenOnlineLatestExceedsDiskCount(t *testing.T) {
	t.Parallel()

	got := NeedsDownload(5, 3)
	if !got {
		t.Fatalf("expected NeedsDownload(online=5, onDisk=3) to be true, got false")
	}
}

// TestNeedsDownloadDoesNotTriggerWhenDiskCountMatchesOnline covers Scenario "Disk count
// already matches online count".
func TestNeedsDownloadDoesNotTriggerWhenDiskCountMatchesOnline(t *testing.T) {
	t.Parallel()

	got := NeedsDownload(5, 5)
	if got {
		t.Fatalf("expected NeedsDownload(online=5, onDisk=5) to be false, got true")
	}
}

// TestNeedsDownloadDoesNotTriggerWhenDiskCountExceedsOnline is the symmetric case: disk
// ahead of online (should never happen organically, but the comparison must still hold).
func TestNeedsDownloadDoesNotTriggerWhenDiskCountExceedsOnline(t *testing.T) {
	t.Parallel()

	got := NeedsDownload(3, 5)
	if got {
		t.Fatalf("expected NeedsDownload(online=3, onDisk=5) to be false, got true")
	}
}

// TestNeedsDownloadNeverConsultsNroCapVisto proves the disk count wins even when
// NroCapVisto would suggest a different answer (download-orchestration spec "NroCapVisto is
// never consulted for the trigger"). NeedsDownload's signature intentionally has NO
// NroCapVisto parameter at all -- this test documents that by constructing the exact
// scenario from the spec and asserting the NroCapVisto-driven answer (would trigger,
// since NroCapVisto=2 < latest 5) is NOT what happens; the disk count (5) already
// satisfies the online latest (5), so no download must trigger.
func TestNeedsDownloadNeverConsultsNroCapVisto(t *testing.T) {
	t.Parallel()

	const nroCapVisto = 2 // if this were consulted, 5 > 2 would suggest "needs download"
	const onlineLatest = 5
	const onDiskCount = 5 // disk already satisfies online latest

	got := NeedsDownload(onlineLatest, onDiskCount)
	if got {
		t.Fatalf("expected disk count (5) to satisfy online latest (5) regardless of NroCapVisto=%d, got NeedsDownload=true", nroCapVisto)
	}
}

// TestNeedsDownloadComparesHighestOnlineNumberNotEntryCount covers Scenario "Online
// numbering gap is compared by highest number, not entry count": online episodes
// [1,2,4] (a gap at 3) means the highest online number is 4, NOT the count of entries (3).
func TestNeedsDownloadComparesHighestOnlineNumberNotEntryCount(t *testing.T) {
	t.Parallel()

	onlineEpisodeNumbers := []int{1, 2, 4}
	highestOnline := HighestEpisodeNumber(onlineEpisodeNumbers)
	if highestOnline != 4 {
		t.Fatalf("expected highest online episode number to be 4, got %d", highestOnline)
	}

	const onDiskCount = 2

	got := NeedsDownload(highestOnline, onDiskCount)
	if !got {
		t.Fatalf("expected NeedsDownload to trigger because highest online (4) exceeds disk count (2), got false")
	}

	// Explicitly assert the entry-count (3) is NOT the comparison basis: if it were, disk=2
	// would already be less than entry-count=3, which is true here too, so we also assert
	// the WRONG comparison value (entry count) differs from the right one (highest number)
	// to prove they are distinct quantities in this scenario.
	entryCount := len(onlineEpisodeNumbers)
	if entryCount == highestOnline {
		t.Fatalf("test setup invalid: entry count (%d) must differ from highest online number (%d) to prove the distinction", entryCount, highestOnline)
	}
}

// TestHighestEpisodeNumberOnEmptySliceReturnsZero documents the zero-value contract for an
// empty online listing (no episodes found online at all).
func TestHighestEpisodeNumberOnEmptySliceReturnsZero(t *testing.T) {
	t.Parallel()

	got := HighestEpisodeNumber(nil)
	if got != 0 {
		t.Fatalf("expected HighestEpisodeNumber(nil) to be 0, got %d", got)
	}

	got = HighestEpisodeNumber([]int{})
	if got != 0 {
		t.Fatalf("expected HighestEpisodeNumber([]) to be 0, got %d", got)
	}
}

// TestHighestEpisodeNumberIgnoresInputOrder proves the helper takes the maximum, not the
// last element, regardless of input ordering.
func TestHighestEpisodeNumberIgnoresInputOrder(t *testing.T) {
	t.Parallel()

	got := HighestEpisodeNumber([]int{4, 1, 2})
	if got != 4 {
		t.Fatalf("expected highest episode number 4 regardless of order, got %d", got)
	}
}

// intPtr is a small test helper to build *int literals inline (mirrors contracts.MobileAnime
// fields, which are pointer-typed to distinguish "absent" from a real zero value).
func intPtr(v int) *int { return &v }

// strPtr is the *string equivalent of intPtr.
func strPtr(v string) *string { return &v }

// TestEvaluateAnimeForDownloadSkipsMovieType covers download-orchestration spec "Explicit
// Tipo 1/2 Skip" / Scenario "Movie-type anime is present in today's active list".
func TestEvaluateAnimeForDownloadSkipsMovieType(t *testing.T) {
	t.Parallel()

	candidate := AnimeDownloadCandidate{
		Tipo:    intPtr(1), // 1 = Pelicula
		Pagina:  strPtr("https://jkanime.net/some-movie/"),
		Carpeta: strPtr(`C:\anime\some-movie`),
	}

	decision := EvaluateAnimeForDownload(candidate)
	if !decision.Skip {
		t.Fatalf("expected Tipo=1 (movie) to be skipped, got Skip=false")
	}
	if decision.SkipReason != SkipReasonUnsupportedTipo {
		t.Fatalf("expected skip reason %q, got %q", SkipReasonUnsupportedTipo, decision.SkipReason)
	}
	if !errors.Is(decision.Err, ErrUnsupportedTipo) {
		t.Fatalf("expected decision.Err to wrap ErrUnsupportedTipo, got %v", decision.Err)
	}
}

// TestEvaluateAnimeForDownloadSkipsOVAType covers Scenario "OVA-type anime is present" --
// same surfaced-reason guarantee as Tipo 1.
func TestEvaluateAnimeForDownloadSkipsOVAType(t *testing.T) {
	t.Parallel()

	candidate := AnimeDownloadCandidate{
		Tipo:    intPtr(2), // 2 = OVA
		Pagina:  strPtr("https://jkanime.net/some-ova/"),
		Carpeta: strPtr(`C:\anime\some-ova`),
	}

	decision := EvaluateAnimeForDownload(candidate)
	if !decision.Skip {
		t.Fatalf("expected Tipo=2 (OVA) to be skipped, got Skip=false")
	}
	if decision.SkipReason != SkipReasonUnsupportedTipo {
		t.Fatalf("expected skip reason %q, got %q", SkipReasonUnsupportedTipo, decision.SkipReason)
	}
	if !errors.Is(decision.Err, ErrUnsupportedTipo) {
		t.Fatalf("expected decision.Err to wrap ErrUnsupportedTipo, got %v", decision.Err)
	}
}

// TestEvaluateAnimeForDownloadDoesNotSkipSeriesType (Tipo nil or 0) is the negative case:
// a regular series MUST NOT be skipped by the Tipo gate.
func TestEvaluateAnimeForDownloadDoesNotSkipSeriesType(t *testing.T) {
	t.Parallel()

	t.Run("tipo nil", func(t *testing.T) {
		candidate := AnimeDownloadCandidate{
			Tipo:    nil,
			Pagina:  strPtr("https://jkanime.net/some-series/"),
			Carpeta: strPtr(`C:\anime\some-series`),
		}
		decision := EvaluateAnimeForDownload(candidate)
		if decision.Skip {
			t.Fatalf("expected Tipo=nil (series) to NOT be skipped, got Skip=true reason=%q", decision.SkipReason)
		}
	})

	t.Run("tipo zero", func(t *testing.T) {
		candidate := AnimeDownloadCandidate{
			Tipo:    intPtr(0), // 0 = Serie
			Pagina:  strPtr("https://jkanime.net/some-series/"),
			Carpeta: strPtr(`C:\anime\some-series`),
		}
		decision := EvaluateAnimeForDownload(candidate)
		if decision.Skip {
			t.Fatalf("expected Tipo=0 (series) to NOT be skipped, got Skip=true reason=%q", decision.SkipReason)
		}
	})
}

// TestEvaluateAnimeForDownloadSkipsMissingPagina covers download-orchestration spec
// "Missing Pagina/Carpeta Surfaced as Actionable State" / Scenario "Anime has no configured
// page".
func TestEvaluateAnimeForDownloadSkipsMissingPagina(t *testing.T) {
	t.Parallel()

	t.Run("nil pagina", func(t *testing.T) {
		candidate := AnimeDownloadCandidate{
			Tipo:    intPtr(0),
			Pagina:  nil,
			Carpeta: strPtr(`C:\anime\some-series`),
		}
		decision := EvaluateAnimeForDownload(candidate)
		if !decision.Skip {
			t.Fatalf("expected missing Pagina to be skipped, got Skip=false")
		}
		if decision.SkipReason != SkipReasonMissingPagina {
			t.Fatalf("expected skip reason %q, got %q", SkipReasonMissingPagina, decision.SkipReason)
		}
		if !errors.Is(decision.Err, ErrMissingPagina) {
			t.Fatalf("expected decision.Err to wrap ErrMissingPagina, got %v", decision.Err)
		}
	})

	t.Run("empty pagina", func(t *testing.T) {
		candidate := AnimeDownloadCandidate{
			Tipo:    intPtr(0),
			Pagina:  strPtr(""),
			Carpeta: strPtr(`C:\anime\some-series`),
		}
		decision := EvaluateAnimeForDownload(candidate)
		if !decision.Skip {
			t.Fatalf("expected empty Pagina to be skipped, got Skip=false")
		}
		if decision.SkipReason != SkipReasonMissingPagina {
			t.Fatalf("expected skip reason %q, got %q", SkipReasonMissingPagina, decision.SkipReason)
		}
	})
}

// TestEvaluateAnimeForDownloadSkipsMissingCarpeta covers Scenario "Anime has no configured
// folder" -- and must NOT attempt to enqueue/poll a nonexistent destination, which this
// pure decision enforces simply by returning Skip=true before any I/O-bearing caller logic
// runs.
func TestEvaluateAnimeForDownloadSkipsMissingCarpeta(t *testing.T) {
	t.Parallel()

	t.Run("nil carpeta", func(t *testing.T) {
		candidate := AnimeDownloadCandidate{
			Tipo:    intPtr(0),
			Pagina:  strPtr("https://jkanime.net/some-series/"),
			Carpeta: nil,
		}
		decision := EvaluateAnimeForDownload(candidate)
		if !decision.Skip {
			t.Fatalf("expected missing Carpeta to be skipped, got Skip=false")
		}
		if decision.SkipReason != SkipReasonMissingCarpeta {
			t.Fatalf("expected skip reason %q, got %q", SkipReasonMissingCarpeta, decision.SkipReason)
		}
		if !errors.Is(decision.Err, ErrMissingCarpeta) {
			t.Fatalf("expected decision.Err to wrap ErrMissingCarpeta, got %v", decision.Err)
		}
	})

	t.Run("empty carpeta", func(t *testing.T) {
		candidate := AnimeDownloadCandidate{
			Tipo:    intPtr(0),
			Pagina:  strPtr("https://jkanime.net/some-series/"),
			Carpeta: strPtr(""),
		}
		decision := EvaluateAnimeForDownload(candidate)
		if !decision.Skip {
			t.Fatalf("expected empty Carpeta to be skipped, got Skip=false")
		}
		if decision.SkipReason != SkipReasonMissingCarpeta {
			t.Fatalf("expected skip reason %q, got %q", SkipReasonMissingCarpeta, decision.SkipReason)
		}
	})
}

// TestEvaluateAnimeForDownloadTipoGateTakesPrecedenceOverGapGate documents the gate
// ordering: a movie/OVA with ALSO missing Pagina/Carpeta is reported as unsupported_tipo,
// not as a gap -- the Tipo gate is checked first since it is the cheaper, more specific
// classification (the anime would never have a meaningful Pagina/Carpeta for our pipeline
// anyway).
func TestEvaluateAnimeForDownloadTipoGateTakesPrecedenceOverGapGate(t *testing.T) {
	t.Parallel()

	candidate := AnimeDownloadCandidate{
		Tipo:    intPtr(1),
		Pagina:  nil,
		Carpeta: nil,
	}
	decision := EvaluateAnimeForDownload(candidate)
	if decision.SkipReason != SkipReasonUnsupportedTipo {
		t.Fatalf("expected Tipo gate to take precedence, got skip reason %q", decision.SkipReason)
	}
}

// TestEvaluateAnimeForDownloadDoesNotSkipEligibleSeries is the fully-eligible positive case:
// Tipo is a series and both Pagina/Carpeta are present, so the candidate is NOT skipped --
// it proceeds to the online-vs-disk decision (handled separately by NeedsDownload).
func TestEvaluateAnimeForDownloadDoesNotSkipEligibleSeries(t *testing.T) {
	t.Parallel()

	candidate := AnimeDownloadCandidate{
		Tipo:    intPtr(0),
		Pagina:  strPtr("https://jkanime.net/some-series/"),
		Carpeta: strPtr(`C:\anime\some-series`),
	}
	decision := EvaluateAnimeForDownload(candidate)
	if decision.Skip {
		t.Fatalf("expected fully-eligible series to NOT be skipped, got Skip=true reason=%q", decision.SkipReason)
	}
	if decision.Err != nil {
		t.Fatalf("expected no error for an eligible candidate, got %v", decision.Err)
	}
}
