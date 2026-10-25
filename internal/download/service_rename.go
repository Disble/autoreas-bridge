package download

import (
	"context"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/logger"
)

// completeDownloadedEpisode turns "JD wrote the episode into the anime folder" into "the
// episode sits at the folder root under a name the counter can read".
//
// The rename is delegated to JDownloader, which downloads straight into the anime folder and
// renames the file in place. Bridge never moves or deletes anything in that folder.
func (s *Service) completeDownloadedEpisode(ctx context.Context, runID string, anime contracts.MobileAnime, episode int) {
	s.renameDownloadedEpisode(ctx, runID, anime, episode)
	// Last, because a notice about a file JD is still renaming would measure the wrong thing.
	s.noticeEpisodeDuration(ctx, anime, episode)
}

// renameDownloadedEpisode gives the episode that just landed a parseable name
// ("NegaPosi Angler - 04.mp4"), so downloadedEpisodeBaseline can resolve the
// download cursor from the highest episode on disk instead of falling back to
// counting files.
//
// Best-effort by construction: the episode is
// already downloaded by the time this runs, and no naming problem is worth
// turning a successful download into a failed one. Every giving-up path is
// Warn-logged so a silently unrenamed folder is still explainable afterwards.
func (s *Service) renameDownloadedEpisode(ctx context.Context, runID string, anime contracts.MobileAnime, episode int) {
	if !s.deps.RenameEpisodes(ctx) {
		return
	}
	if s.deps.JD == nil || anime.Folder == nil || *anime.Folder == "" {
		return
	}

	base, err := filesystem.EpisodeBaseName(anime.Name, episode)
	if err != nil {
		s.logAnimef(logger.LevelWarn, runID, anime, "download.rename_failed",
			map[string]any{"episode": episode},
			"anime %s: episode %d kept its downloaded name: %v", anime.Name, episode, err)
		return
	}

	renamed, err := s.deps.JD.RenameEpisodeByDestination(ctx, s.deps.JDDeviceName, *anime.Folder, base)
	if err != nil {
		s.logAnimef(logger.LevelWarn, runID, anime, "download.rename_failed",
			map[string]any{"episode": episode},
			"anime %s: episode %d kept its downloaded name: %v", anime.Name, episode, err)
		return
	}
	s.logAnimef(logger.LevelInfo, runID, anime, "download.renamed",
		map[string]any{"episode": episode, "fileName": renamed},
		"anime %s: episode %d renamed to %s", anime.Name, episode, renamed)
}
