// Package config holds named-constant defaults for internal/download (design.md §2
// "config/defaults.go", dlexa config.static shape), so spec, store seeding, and tests agree
// on a single source of truth for these values.
package config

import "time"

// HosterPrioritySeed is a single seed row for the default hoster ordering.
type HosterPrioritySeed struct {
	Hoster   string
	Priority int
}

// DefaultHosterPrioritySeed matches the validated PoC defaults (cmd/poc/scraper.go
// hosterPriority): Mediafire and Mega are preferred (fast, reliable, JD-native support),
// followed by Vidhide, Mp4upload, and Mixdrop; any hoster not listed here is "unconfigured"
// and falls back to alphabetical ordering (download.HosterResolver, design §4.4 / ADR-HOSTER).
// download-config spec "First run seeds defaults". New defaults are appended to existing
// installs (never reordering user-configured rows) by ensureDefaultHosterPriority.
var DefaultHosterPrioritySeed = []HosterPrioritySeed{
	{Hoster: "Mediafire", Priority: 0},
	{Hoster: "Mega", Priority: 1},
	{Hoster: "Vidhide", Priority: 2},
	{Hoster: "Mp4upload", Priority: 3},
	{Hoster: "Mixdrop", Priority: 4},
}

// RunRetentionLimit is the maximum number of download_runs rows retained after each
// FinalizeRun prune (design §4.5/§8, ADR-RETENTION). ~7 months of daily history.
const RunRetentionLimit = 200

// JDAutoLaunchPollTimeout bounds how long EnsureOnline polls ListDevices for the
// configured device after launching the JDownloader executable (design §3.3, PoC #12).
const JDAutoLaunchPollTimeout = 90 * time.Second

// FilesystemCompletionPollInterval is how often the filesystem completion poll re-checks
// CountRecursive while waiting for a download to land (PoC orchestrator.go, design §5.1).
const FilesystemCompletionPollInterval = 5 * time.Second

// FilesystemCompletionPollTimeout bounds the filesystem completion poll per hoster batch
// before the system classifies the outcome as slow_or_timeout (PoC orchestrator.go).
const FilesystemCompletionPollTimeout = 30 * time.Minute

// VideoFileExtensions are the file extensions counted as downloaded episodes by
// EpisodeCounter (PoC finder.go videoExtensions, design §3.4).
var VideoFileExtensions = map[string]bool{
	".mp4":  true,
	".mkv":  true,
	".avi":  true,
	".webm": true,
	".m4v":  true,
	".flv":  true,
	".mov":  true,
	".wmv":  true,
	".ts":   true,
}

// WeekdayName returns the English weekday name (Monday...Sunday) for the given time,
// accepting a time.Time parameter (rather than reading the wall clock) so callers/tests can
// pin a fixed weekday (SDD-55 ADR-55-4, episode-vocabulary spec). This is the English-domain
// replacement for this package's retired Spanish-literal weekday vocabulary: no exported
// Spanish weekday symbol remains here. Anime schedule days stored as Legacy-Spanish literals
// (e.g. "Lunes") are translated to this English representation at read time by the
// download-selection domain; storage itself is untouched (additive migration only).
func WeekdayName(t time.Time) string {
	return t.Weekday().String()
}
