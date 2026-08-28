package download

import (
	"errors"
	"testing"
)

func TestNeedsDownloadTriggersWhenOnlineLatestExceedsDiskCount(t *testing.T) {
	t.Parallel()
	if !NeedsDownload(5, 3) {
		t.Fatal("expected online latest greater than disk count to trigger")
	}
}

func TestNeedsDownloadDoesNotTriggerWhenDiskCountMatchesOnline(t *testing.T) {
	t.Parallel()
	if NeedsDownload(5, 5) {
		t.Fatal("expected matching online and disk counts to be current")
	}
}

func TestNeedsDownloadDoesNotTriggerWhenDiskCountExceedsOnline(t *testing.T) {
	t.Parallel()
	if NeedsDownload(3, 5) {
		t.Fatal("expected disk ahead of online to be current")
	}
}

func TestNeedsDownloadNeverConsultsNroCapVisto(t *testing.T) {
	t.Parallel()
	if NeedsDownload(5, 5) {
		t.Fatal("expected disk count to remain authoritative")
	}
}

func TestNeedsDownloadComparesHighestOnlineNumberNotEntryCount(t *testing.T) {
	t.Parallel()
	highest := HighestEpisodeNumber([]int{1, 2, 4})
	if highest != 4 || !NeedsDownload(highest, 2) {
		t.Fatalf("highest online number = %d, want 4 and a download trigger", highest)
	}
}

func TestHighestEpisodeNumberOnEmptySliceReturnsZero(t *testing.T) {
	t.Parallel()
	if got := HighestEpisodeNumber(nil); got != 0 {
		t.Fatalf("HighestEpisodeNumber(nil) = %d, want 0", got)
	}
	if got := HighestEpisodeNumber([]int{}); got != 0 {
		t.Fatalf("HighestEpisodeNumber([]) = %d, want 0", got)
	}
}

func TestHighestEpisodeNumberIgnoresInputOrder(t *testing.T) {
	t.Parallel()
	if got := HighestEpisodeNumber([]int{4, 1, 2}); got != 4 {
		t.Fatalf("HighestEpisodeNumber = %d, want 4", got)
	}
}

func TestEvaluateAnimeForDownloadReturnsCanonicalReasonsInOrder(t *testing.T) {
	registry := &spySiteRegistry{source: &spyEpisodeSource{}}
	tests := []struct {
		name     string
		page     *string
		folder   *string
		root     string
		registry *spySiteRegistry
		want     []ReadinessReason
		wantErr  error
	}{
		{name: "missing source", folder: nil, registry: registry, want: []ReadinessReason{DownloadReadinessMissingSource, DownloadReadinessDestinationUnresolved}, wantErr: ErrMissingSource},
		{name: "invalid source", page: new("relative/page"), folder: new("D:/anime"), registry: registry, want: []ReadinessReason{DownloadReadinessInvalidSource}, wantErr: ErrInvalidSource},
		{name: "unsupported source", page: new("https://unsupported.example/page"), folder: new("D:/anime"), registry: &spySiteRegistry{err: ErrSiteUnsupported}, want: []ReadinessReason{DownloadReadinessUnsupportedSource}, wantErr: ErrUnsupportedSource},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			decision := EvaluateAnimeForDownload(AnimeDownloadCandidate{
				Name: "Anime", Pagina: tt.page, Carpeta: tt.folder, DownloadsRoot: tt.root, Sites: tt.registry,
			})
			if !decision.Skip || !errors.Is(decision.Err, tt.wantErr) {
				t.Fatalf("decision = %#v, want blocked by %v", decision, tt.wantErr)
			}
			if len(decision.Reasons) != len(tt.want) {
				t.Fatalf("reasons = %#v, want %#v", decision.Reasons, tt.want)
			}
			for i := range tt.want {
				if decision.Reasons[i] != tt.want[i] {
					t.Fatalf("reasons = %#v, want %#v", decision.Reasons, tt.want)
				}
			}
		})
	}
}

func TestEvaluateAnimeForDownloadIgnoresTypeAndUsesMatchedSourceWithoutListing(t *testing.T) {
	source := &spyEpisodeSource{}
	registry := &spySiteRegistry{source: source}
	folder := `D:\anime\missing-on-disk`
	decision := EvaluateAnimeForDownload(AnimeDownloadCandidate{
		Name: "Movie", Tipo: new(2), Pagina: new("https://supported.example/movie"), Carpeta: &folder, Sites: registry,
	})
	if decision.Skip || decision.Source != source || len(decision.Reasons) != 0 || decision.Destination != folder {
		t.Fatalf("decision = %#v, want ready matched movie destination", decision)
	}
	if source.listEpisodesCalls != 0 {
		t.Fatalf("local readiness called ListEpisodes %d times", source.listEpisodesCalls)
	}
}
