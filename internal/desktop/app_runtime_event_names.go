package desktop

import "autoreas-bridge/internal/events"

// The desktop whitelists of bus events that reach the WebView. A bus event
// reaches the frontend only when it is named on one of these lists, and only
// through the matching bridge registered at startup, so this file is the one
// place that answers "which runtime events does the desktop forward".

// downloadRuntimeEventNames is the download run's whitelist, forwarded by
// registerDownloadRuntimeEventBridge.
var downloadRuntimeEventNames = [...]string{
	events.EventNameDownloadRunStarted,
	events.EventNameDownloadRunProgress,
	events.EventNameDownloadRunFinished,
	events.EventNameDownloadEpisodeAvailable,
	events.EventNameDownloadEpisodeDownloaded,
	events.EventNameDownloadFailed,
	events.EventNameDownloadSkipped,
	events.EventNameDownloadJDStatus,
	events.EventNameDownloadEpisodeDownloading,
}

// seasonRuntimeEventNames is the season matching run's whitelist, forwarded by
// registerSeasonRuntimeEventBridge: only bus events on this list reach the
// WebView, and only through that bridge.
var seasonRuntimeEventNames = [...]string{
	events.EventNameSeasonMatchingStarted,
	events.EventNameSeasonMatchingProgress,
	events.EventNameSeasonMatchingFinished,
}
