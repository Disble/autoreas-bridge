package download

import (
	"context"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/logger"
)

// completeDownloadedEpisode turns "JD wrote a file somewhere under the anime folder" into
// "the episode is at the folder root under a name the counter can read".
//
// Order matters, and it is the REVERSE of the original filesystem-only pipeline. The rename
// is delegated to JDownloader, and JD can only rename a file whose path it still knows --
// so it must run BEFORE the Flattener moves that file out of JD's package subfolder. Doing
// it the other way round leaves JD pointing at a path Bridge already emptied.
func (s *Service) completeDownloadedEpisode(ctx context.Context, runID string, anime contracts.MobileAnime, episode int) {
	s.renameDownloadedEpisode(ctx, runID, anime, episode)
	s.flattenDownloadFolder(ctx, runID, anime)
}

// renameDownloadedEpisode gives the episode that just landed a parseable name
// ("NegaPosi Angler - 04.mp4"), so downloadedEpisodeBaseline can resolve the
// download cursor from the highest episode on disk instead of falling back to
// counting files.
//
// Best-effort by construction, exactly like flattenDownloadFolder: the episode is
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
		s.logf(logger.LevelWarn, runID, anime.ID, "download.rename_failed",
			map[string]any{"episode": episode},
			"anime %s: episode %d kept its downloaded name: %v", anime.Name, episode, err)
		return
	}

	renamed, err := s.deps.JD.RenameEpisodeByDestination(ctx, s.deps.JDDeviceName, *anime.Folder, base)
	if err != nil {
		s.logf(logger.LevelWarn, runID, anime.ID, "download.rename_failed",
			map[string]any{"episode": episode},
			"anime %s: episode %d kept its downloaded name: %v", anime.Name, episode, err)
		return
	}
	s.logf(logger.LevelInfo, runID, anime.ID, "download.renamed",
		map[string]any{"episode": episode, "fileName": renamed},
		"anime %s: episode %d renamed to %s", anime.Name, episode, renamed)
}
