package main

import "autoreas-bridge/internal/download/jdownloader"

// jdMaxConcurrentAnimes reports how many animes may download at once, taken from
// JDownloader's own "Max. simultaneous Downloads" setting.
//
// Bridge processes animes concurrently, but JD runs only this many transfers at a time.
// Anything beyond the limit sits queued in JD: it writes no .part file and reports nothing
// running, and the hoster watch reads that silence as a dead hoster, removes the package and
// falls back to the next hoster on a download that was merely waiting its turn.
//
// Returns 0 (unthrottled, the previous behaviour) when the setting cannot be read, which
// happens when JD is not installed locally or its path is not configured. Degrading to
// unthrottled rather than to 1 keeps an unreadable config from silently serialising a run.
func jdMaxConcurrentAnimes() int {
	exePath, err := jdownloader.ResolveExePath()
	if err != nil {
		return 0
	}
	limit, err := jdownloader.MaxSimultaneousDownloads(exePath)
	if err != nil {
		return 0
	}
	return limit
}
