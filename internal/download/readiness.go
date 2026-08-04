package download

import (
	"context"
	"fmt"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/config"
)

// ReadinessReason is the download-context alias for the public readiness code.
type ReadinessReason = contracts.DownloadReadinessReason

const (
	// DownloadReadinessMissingSource identifies an anime without a source page.
	DownloadReadinessMissingSource = contracts.DownloadReadinessMissingSource
	// DownloadReadinessInvalidSource identifies a source page that is not an absolute HTTP URL.
	DownloadReadinessInvalidSource = contracts.DownloadReadinessInvalidSource
	// DownloadReadinessUnsupportedSource identifies a source page without a registered adapter.
	DownloadReadinessUnsupportedSource = contracts.DownloadReadinessUnsupportedSource
	// DownloadReadinessDestinationUnresolved identifies an anime without a deterministic destination.
	DownloadReadinessDestinationUnresolved = contracts.DownloadReadinessDestinationUnresolved
)

// AnimeDownloadReadiness is the download-context alias for one catalog readiness item.
type AnimeDownloadReadiness = contracts.AnimeDownloadReadiness

// ReadinessServiceDeps supplies the local catalog, settings, adapters, and schedule clock.
type ReadinessServiceDeps struct {
	Animes        contracts.AnimeQueryService
	DownloadsRoot func(context.Context) (string, error)
	Sites         SiteRegistry
	Clock         func() time.Time
	SeasonMode    func(context.Context) bool
}

// ReadinessService builds catalog-wide local readiness without runtime side effects.
type ReadinessService struct {
	deps ReadinessServiceDeps
}

// NewReadinessService builds a local readiness query service.
func NewReadinessService(deps ReadinessServiceDeps) *ReadinessService {
	if deps.Clock == nil {
		deps.Clock = time.Now
	}
	if deps.SeasonMode == nil {
		deps.SeasonMode = func(context.Context) bool { return false }
	}
	return &ReadinessService{deps: deps}
}

// BuildSnapshot evaluates every catalog anime using only local data and adapter matching.
func (s *ReadinessService) BuildSnapshot(ctx context.Context) (contracts.DownloadReadinessSnapshot, error) {
	if s == nil || s.deps.Animes == nil || s.deps.DownloadsRoot == nil || s.deps.Sites == nil {
		return contracts.DownloadReadinessSnapshot{}, fmt.Errorf("download readiness dependencies unavailable")
	}
	animes, err := s.deps.Animes.ListMobileAnimes(ctx)
	if err != nil {
		return contracts.DownloadReadinessSnapshot{}, fmt.Errorf("list anime catalog for download readiness: %w", err)
	}
	root, err := s.deps.DownloadsRoot(ctx)
	if err != nil {
		return contracts.DownloadReadinessSnapshot{}, fmt.Errorf("read downloads root for readiness: %w", err)
	}
	target := config.WeekdayName(s.deps.Clock())
	if s.deps.SeasonMode(ctx) {
		target = seasonModeDiaName
	}
	snapshot := contracts.DownloadReadinessSnapshot{Items: make([]contracts.AnimeDownloadReadiness, 0, len(animes))}
	for _, anime := range animes {
		decision := EvaluateAnimeForDownload(AnimeDownloadCandidate{
			Name: anime.Name, Pagina: anime.SourceURL, Carpeta: anime.Folder, DownloadsRoot: root, Sites: s.deps.Sites,
		})
		item := contracts.AnimeDownloadReadiness{
			AnimeID: anime.ID, Name: anime.Name, Ready: !decision.Skip,
			Reasons:        append([]contracts.DownloadReadinessReason(nil), decision.Reasons...),
			ScheduledToday: isScheduledAnime(anime, target),
		}
		if item.Reasons == nil {
			item.Reasons = []contracts.DownloadReadinessReason{}
		}
		snapshot.Items = append(snapshot.Items, item)
		if item.ScheduledToday {
			snapshot.ScheduledTotal++
			if item.Ready {
				snapshot.ScheduledReady++
			} else {
				snapshot.ScheduledBlocked++
			}
		}
	}
	return snapshot, nil
}

// isScheduledAnime applies schedule membership without turning activity into readiness policy.
func isScheduledAnime(anime contracts.MobileAnime, target string) bool {
	if anime.Active != 1 {
		return false
	}
	for _, day := range anime.Days {
		if englishWeekday(day.Day) == target {
			return true
		}
	}
	return false
}
