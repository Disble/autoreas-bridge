// Package jdownloader implements the JDClient port (design.md §3.3, PoC #12/#13) on top of
// github.com/Disble/jdownloader-go. Connect() succeeding does NOT prove JD is online -- only
// ListDevices() finding the configured device name is a valid liveness proof (the PoC #12
// quirk this design calls out explicitly). AddAndStart NEVER sets a package name so JD does not
// create a per-package subfolder (PoC #13; filesystem.Flatten exists to mop up any subfolder
// JD still creates on its own).
package jdownloader

import "context"

// DeviceStatus is the liveness-checked view of a single MyJDownloader device (design §3.3).
type DeviceStatus struct {
	Name   string
	Online bool
}

// EnqueueRequest is the input to AddAndStart. PackageName is intentionally ABSENT from this
// struct -- it must never be set, because an empty package name avoids JD creating a per-package
// destination subfolder (PoC #13 quirk; design §3.3).
type EnqueueRequest struct {
	URLs        []string
	Destination string // per-anime Carpeta; "" lets the JD adapter's configured default apply.
}

// LinkSignal is a neutral, structured view of a single JD download-stage link (design.md
// "Split port (signals) from orchestration (classification)"). No JD library types leak past this
// boundary -- only booleans and the raw StatusIconKey string, never the free-form Status text.
type LinkSignal struct {
	Finished, Running, Skipped bool
	StatusIconKey              string
}

// PackageSignal is a neutral, structured view of a single JD download package. It carries only
// the fields the classifier needs from github.com/Disble/jdownloader-go's DownloadPackage
// surface, again excluding the localized free-form Status text.
type PackageSignal struct {
	Finished, Running                 bool
	FinishedObserved, RunningObserved bool
	StatusIconKey                     string
}

// DestinationStatus is the aggregated, neutral JD status for every crawl/download package whose
// SaveTo normalizes-equal to a destination folder (design.md "Correlate strictly by normalized
// SaveTo == Carpeta"). Matched=false means nothing has crawled/enqueued for that folder yet --
// callers MUST treat that as "downloading", never "dead".
type DestinationStatus struct {
	Matched                             bool
	CrawlOnlineCount, CrawlOfflineCount int
	PackageSignals                      []PackageSignal
	Links                               []LinkSignal
}

// JDClient is the port the download orchestrator depends on (design.md §3.3). ListDevices is
// the ONLY liveness proof: Connect() can succeed while the configured device is offline.
type JDClient interface {
	Connect(ctx context.Context) error
	// ListDevices is the ONLY liveness proof for a specific device (Connect succeeding is NOT
	// sufficient -- design §3.3 PoC #12 quirk).
	ListDevices(ctx context.Context) ([]DeviceStatus, error)
	// EnsureOnline connects, checks ListDevices for deviceName, and -- if absent and
	// launchIfMissing is true -- launches the configured executable and polls ListDevices up to
	// the auto-launch timeout (design config.JDAutoLaunchPollTimeout, 90s).
	EnsureOnline(ctx context.Context, deviceName string, launchIfMissing bool) error
	// AddAndStart enqueues req.URLs on deviceName with autostart, and deliberately WITHOUT a
	// package name (PoC #13 quirk -- see EnqueueRequest doc).
	AddAndStart(ctx context.Context, deviceName string, req EnqueueRequest) error
	// PackageStatusByDestination returns aggregated JD signals for the package(s) whose SaveTo
	// matches destination (SaveTo == anime.Carpeta). Matched=false when nothing has
	// crawled/enqueued for that folder yet (treated as "downloading", see DestinationStatus doc).
	PackageStatusByDestination(ctx context.Context, deviceName, destination string) (DestinationStatus, error)
	// RemoveByDestination removes every crawl/download package whose SaveTo matches destination
	// (best-effort cleanup before hoster fallback advances past a dead package -- design-orch
	// "Dead Package Removed From JD Before Advancing"). Callers MUST treat a non-nil error as
	// non-fatal: log and continue, never abort the run.
	RemoveByDestination(ctx context.Context, deviceName, destination string) error
	// RenameEpisodeByDestination asks JD to rename the episode it just finished in
	// destination to baseName + JD's own extension, returning the applied file name.
	// MUST run before the Flattener: JD can only rename a file it still knows the path of.
	// Returns ErrNoRenamableLink when JD holds no finished link for that folder.
	RenameEpisodeByDestination(ctx context.Context, deviceName, destination, baseName string) (string, error)
	Disconnect(ctx context.Context) error
}
