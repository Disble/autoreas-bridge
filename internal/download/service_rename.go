package download

import (
	"context"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/logger"
)

// completeDownloadedEpisode runs the two filesystem fix-ups that turn "JD wrote a
// file somewhere under the anime folder" into "the episode is at the folder root
// under a name the counter can read".
//
// Order matters: flattening lifts the file out of JD's package subfolder, and only
// then is there something at the root for the renamer to target.
func (s *Service) completeDownloadedEpisode(ctx context.Context, runID string, anime contracts.MobileAnime, episode int) {
	s.flattenDownloadFolder(ctx, runID, anime)
	s.renameDownloadedEpisode(ctx, runID, anime, episode)
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
	if s.deps.Renamer == nil || anime.Folder == nil || *anime.Folder == "" {
		return
	}

	renamed, err := s.deps.Renamer.RenameLatestEpisode(*anime.Folder, anime.Name, episode)
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
