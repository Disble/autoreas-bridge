package download

// The notification kinds this package raises. Kind is a second axis next to Source: Source names
// the bounded context ("download"), Kind names the specific event within it, and the detail
// pane's metadata footer renders it beside the correlation id.
//
// Every string here is taken verbatim from the approved design canvas (Anatomy.dc.html labels
// each example block with one; Main.dc.html shows download.run_stopped_early in the footer).
// They are deliberately NOT normalized into one naming style even though the canvas mixes bare
// and dotted forms -- these are persisted values a stored record already holds, so the canvas
// spelling is the contract and tidying it would orphan every record written under the old one.
//
// They live in the producing package rather than in internal/notification, which must name no
// specific feature, and rather than in the center's intent registry, which exists for keys BOTH
// a producer and the composition root must agree on. A kind has no such two-sided contract: the
// producer writes it and the reader displays it.
const (
	// kindRunStarted marks the notification raised when a run begins.
	kindRunStarted = "run_started"
	// kindRunCompleted marks a run that finished cleanly with episodes downloaded.
	kindRunCompleted = "run_completed"
	// kindRunStoppedEarly marks a run that ended without doing everything it set out to do --
	// partial, wholly failed, or stopped by the user. The canvas draws exactly one kind for
	// that outcome family; the level and title still separate the three causes.
	kindRunStoppedEarly = "download.run_stopped_early"
	// kindJDownloaderOffline marks a run blocked by an offline MyJDownloader, leaving episodes
	// that need a manual download.
	kindJDownloaderOffline = "jdownloader_offline"
)
