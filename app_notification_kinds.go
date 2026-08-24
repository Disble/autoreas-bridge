package main

// The notification kinds the app-level producers raise. Kind is a second axis next to Source:
// Source names the bounded context that raised the notification ("sync", "device", "season",
// "schedule"), Kind names the specific event within it, and the detail pane's metadata footer
// renders it beside the correlation id -- so a producer that leaves Kind empty is permanently
// unidentifiable there, because an absent kind renders as an absent row.
//
// Every string here that the approved design canvas draws is taken verbatim from it
// (Anatomy.dc.html labels each example block with one, and lists the blockless kinds as chips).
// They are deliberately NOT normalized into one naming style even though the canvas mixes bare
// and dotted forms -- these are persisted values a stored record already holds, so the canvas
// spelling is the contract and tidying it would orphan every record written under the old one.
// This mirrors internal/download/service_notification_kinds.go, which made the same call for the
// download producer's four kinds.
//
// They live in the producing package rather than in internal/notification, which must name no
// specific feature, and rather than in the center's intent registry, which exists for keys BOTH
// a producer and the composition root must agree on. A kind has no such two-sided contract: the
// producer writes it and the reader displays it.
const (
	// seasonAvailableKind marks the season producer's "these anime are available to create"
	// notification. Drawn on the artboard as a row-bearing example block.
	seasonAvailableKind = "season.anime_available"
	// seasonPastDownloadWindowKind marks a Ver hoy batch that landed after today's
	// auto-download already ran, so the episodes need a manual download to be watchable today.
	//
	// This is the one app-level kind the artboard neither draws as an example nor lists as a
	// blockless chip -- the canvas names fifteen kinds and draws fewer, and this event is one
	// it never got to. It is therefore chosen rather than transcribed, and it is chosen to sit
	// in the same dotted season family as its sibling above: same Source, same producer file,
	// same "something happened to this season's schedule" shape. Naming it in isolation (say,
	// a bare "past_download_window") would have split one bounded context's vocabulary across
	// two naming styles for no reason the canvas asked for.
	seasonPastDownloadWindowKind = "season.past_download_window"
	// syncHealthWarningKind marks a paired device whose sync health has degraded. BOTH device
	// health branches share it -- the one approaching the stale window and the one already past
	// it -- because the artboard draws exactly one sync-health kind among its blockless six.
	//
	// That is the same call internal/download made for download.run_stopped_early, which
	// collapses partial, wholly failed, and user-stopped runs into one kind: the canvas draws
	// one kind for the outcome family, and the level and title still separate the causes. A
	// second, undrawn "sync_health_stale" would add a persisted vocabulary word the design
	// never approved, to distinguish two notifications that already differ by title.
	syncHealthWarningKind = "sync_health_warning"
	// devicePairedKind marks a mobile device completing pairing with this bridge. Listed on the
	// artboard as one of the six kinds with nothing to individuate: a sentence is the whole
	// notification.
	devicePairedKind = "device.paired"
	// missedScheduleKind marks a selected day whose scheduled download never ran because Bridge
	// was closed when it came due. Also one of the artboard's blockless six, and the kind whose
	// two actions -- "Run now" and "Ignore" -- already have registered intents waiting for a
	// producer to freeze tokens against them.
	missedScheduleKind = "missed_schedule"
)
