package desktop

import (
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
)

// toContractsJDStatus maps a download JD configuration to its API contract.
func toContractsJDStatus(cfg download.JDConfig) contracts.JDStatus {
	return contracts.JDStatus{
		Email:           cfg.Email,
		HasPassword:     cfg.HasPassword,
		DeviceName:      cfg.DeviceName,
		ExePathOverride: cfg.ExePathOverride,
		DefaultDestDir:  cfg.DefaultDestDir,
		LastSeenStatus:  cfg.LastSeenStatus,
		LastSeenAtMs:    cfg.LastSeenAtMs,
		LastDecryptErr:  cfg.LastDecryptError,
	}
}

// toContractsHosterPriority maps hoster priorities to API contract items.
func toContractsHosterPriority(entries []download.HosterPriorityEntry) []contracts.HosterPriorityItem {
	out := make([]contracts.HosterPriorityItem, 0, len(entries))
	for _, e := range entries {
		out = append(out, contracts.HosterPriorityItem{
			Hoster:   e.Hoster,
			Priority: e.Priority,
			Enabled:  e.Enabled,
		})
	}
	return out
}

// toContractsManualLinks maps manual download links to API contract items.
func toContractsManualLinks(links []download.ManualLink) []contracts.ManualLink {
	out := make([]contracts.ManualLink, 0, len(links))
	for _, l := range links {
		out = append(out, contracts.ManualLink{
			Anime:   l.Anime,
			Episode: l.Episode,
			Links:   l.Links,
		})
	}
	return out
}

// toContractsDownloadRunView maps a download run to its API view.
func toContractsDownloadRunView(run download.Run) contracts.DownloadRunView {
	return contracts.DownloadRunView{
		RunID:               run.RunID,
		StartedAtMs:         run.StartedAtMs,
		FinishedAtMs:        run.FinishedAtMs,
		Trigger:             run.Trigger,
		AnimesChecked:       run.AnimesChecked,
		EpisodesFound:       run.EpisodesFound,
		EpisodesDownloaded:  run.EpisodesDownloaded,
		EpisodesFailed:      run.EpisodesFailed,
		EpisodesDownloading: max(0, run.EpisodesFound-run.EpisodesDownloaded-run.EpisodesFailed),
		SkippedCount:        run.SkippedCount,
		UpToDateCount:       run.UpToDateCount,
		JDAvailable:         run.JDAvailable,
		Status:              run.Status,
		ErrorSummary:        run.ErrorSummary,
		ManualLinks:         toContractsManualLinks(run.ManualLinks),
	}
}
