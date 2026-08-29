package download

import "autoreas-bridge/internal/download/jdownloader"

// exitReason names the exact terminal point that produced a hoster attempt's outcome.
//
// It is a defined string type rather than an iota enum on purpose: the value reaches persisted
// metadata, and a string zero value means "never stamped" instead of silently denoting a real
// terminal point. The named type still prevents an arbitrary string from being assigned at a
// stamp site.
//
// The enum is CLOSED at 17 values, enumerated below in the order an attempt reaches them:
// thirteen attempt-level terminal points stamped onto hosterOutcome, then four pipeline-level
// points resolved by enqueueWithFallback. Three pairs (client-absent, query-error, no-signal)
// deliberately keep a separate value for the first hoster and for a fallback: they share a
// terminal point but not a cause, and hosterOutcomeKind cannot express that difference.
type exitReason string

const (
	// exitUnset is the zero value: never emitted, and never stamped onto any outcome. It is
	// load-bearing exactly once -- enqueueWithFallback's final return reads it to tell "the
	// link extractor produced nothing, so no attempt ever ran" apart from "every attempt
	// failed", two cases that share one return statement. That is why it needs no synthetic
	// "exhausted" eighteenth value.
	exitUnset exitReason = ""

	// --- attempt level: stamped onto hosterOutcome in service_hoster_watch.go ---

	// exitCounterUnavailable is the watch entry with no episode counter wired: the attempt
	// cannot measure disk at all, so it can only time out.
	exitCounterUnavailable exitReason = "counter_unavailable"
	// exitDiskAheadAtEntry is a success the attempt did NOT observe: the disk count was
	// already past the baseline when the attempt began. It flattens and returns without
	// renaming, which is what separates it from exitFSPollConfirmed.
	exitDiskAheadAtEntry exitReason = "disk_ahead_at_entry"
	// exitPrecheckDead is the pre-check removal: JD already reported the hoster dead before
	// the 60s grace even started.
	exitPrecheckDead exitReason = "precheck_dead"
	// exitFSPollConfirmed is a success this attempt DID observe: the completion poll watched
	// the count advance, and the episode was renamed on the way out.
	exitFSPollConfirmed exitReason = "fs_poll_confirmed"
	// exitFSPollDeadline is the completion poll running out its safety cap.
	exitFSPollDeadline exitReason = "fs_poll_deadline"
	// exitCancelledDuringPoll is the completion poll interrupted by a stopped run. A user
	// pressing Stop and a genuine 30-minute timeout are different decisions, so they keep
	// different values even though both classify as a timeout.
	exitCancelledDuringPoll exitReason = "cancelled_during_poll"
	// exitGraceClientAbsentFirst is the post-grace dead end with no JD client at all, on the
	// first hoster.
	exitGraceClientAbsentFirst exitReason = "grace_client_absent_first"
	// exitGraceClientAbsentFallback mirrors exitGraceClientAbsentFirst on a fallback hoster,
	// where the same dead end classifies as a timeout rather than dead.
	exitGraceClientAbsentFallback exitReason = "grace_client_absent_fallback"
	// exitGraceQueryErrorFirst is the post-grace removal that follows a FAILED status query on
	// the first hoster. No status was observed, so the removal is blind.
	exitGraceQueryErrorFirst exitReason = "grace_query_error_first"
	// exitGraceQueryErrorFallback mirrors exitGraceQueryErrorFirst on a fallback hoster, which
	// removes nothing and only times out.
	exitGraceQueryErrorFallback exitReason = "grace_query_error_fallback"
	// exitGraceClassifiedDead is the post-grace removal over a status the classifier read as
	// dead.
	exitGraceClassifiedDead exitReason = "grace_classified_dead"
	// exitGraceNoSignalFirst is the post-grace removal on the first hoster when the status
	// carried neither a dead verdict nor any positive signal.
	exitGraceNoSignalFirst exitReason = "grace_no_signal_first"
	// exitGraceNoSignalFallback mirrors exitGraceNoSignalFirst on a fallback hoster, which
	// removes nothing and only times out.
	exitGraceNoSignalFallback exitReason = "grace_no_signal_fallback"

	// --- pipeline level: resolved by enqueueWithFallback in service_pipeline.go ---

	// exitJDUnavailable is the pre-attempt return with no downloader client: no hoster was
	// ever attempted.
	exitJDUnavailable exitReason = "jd_unavailable"
	// exitCancelledBeforeAttempt is the mid-loop return taken when the run stopped before the
	// next hoster attempt started.
	exitCancelledBeforeAttempt exitReason = "cancelled_before_attempt"
	// exitEnqueueError is always an ATTEMPT exit -- the enqueue-error path emits its own
	// ledger row and CONTINUES to the next hoster, so it becomes the EPISODE exit only by
	// surviving as the last attempt's exit.
	exitEnqueueError exitReason = "enqueue_error"
	// exitNoHosters is the empty-priority-order fall-through: the link extractor resolved no
	// hoster to try. It is recorded only when no attempt ever ran, never as a stand-in for an
	// exhausted chain.
	exitNoHosters exitReason = "no_hosters"
)

// probe is one FASE 1 filesystem check for transfer evidence.
//
// elapsedMs is milliseconds elapsed since attemptStart -- the top of awaitHosterOutcome, which is
// enqueue-equivalent -- NOT since the start of the detect phase. It is an OFFSET, never an epoch,
// and deliberately not named atMs: the persisted row already carries occurred_at_ms in epoch
// millis, and a reader who reads this field as one draws the wrong conclusion.
//
// To recover the absolute instant of probe n from a persisted download.detect_start_failed row --
// which is emitted immediately after the LAST probe -- compute
// occurred_at_ms - (probes[last].elapsedMs - probes[n].elapsedMs), always using the last RECORDED
// offset. Never subtract a literal 60000: under the attempt-start anchor the last probe lands at
// preCheckLatency + 60000, so a hardcoded grace is wrong by exactly the pre-check round trip.
// That join is what ties a probe window to JD's own transfer window -- the arithmetic the original
// run-dl1532pqkk3g investigation had to perform by hand against an external log.
//
// Anchoring at attempt start rather than at the detect phase is what makes the array carry
// information: detect-relative offsets would always be exactly 20000/40000/60000, so the array
// would degenerate into three booleans. Anchored at attempt start, the FIRST offset exposes
// pre-check latency while the SPACING between consecutive entries still shows the 20s schedule.
type probe struct {
	elapsedMs int64
	found     bool
}

// attemptOutcomeName renders a watch outcome for the per-attempt ledger. The enqueue-error
// outcome has no hosterOutcomeKind because that path never reaches the watch at all.
func attemptOutcomeName(kind hosterOutcomeKind) string {
	switch kind {
	case hosterOutcomeSuccess:
		return "success"
	case hosterOutcomeDead:
		return "dead"
	default:
		return "timeout"
	}
}

// verdictName renders a classifier verdict for persisted metadata. It is a function rather than a
// String() method so that adding it cannot change how any existing %v format renders the verdict.
func verdictName(verdict hosterVerdict) string {
	switch verdict {
	case verdictDead:
		return "dead"
	case verdictFinishedOK:
		return "finished_ok"
	default:
		return "downloading"
	}
}

// anyFinishedSignal reports whether the status carries at least one finished link or package --
// the signal that a removal is about to destroy completed work.
func anyFinishedSignal(status jdownloader.DestinationStatus) bool {
	for _, link := range status.Links {
		if link.Finished {
			return true
		}
	}
	for _, pkg := range status.PackageSignals {
		if pkg.FinishedObserved && pkg.Finished {
			return true
		}
	}
	return false
}

// jdRemovedMetadata builds the forensic payload for one package removal.
//
// A nil status means the removal was blind, and the status fields are then OMITTED rather than
// reported as zeroes: a zero that was never measured and a measured zero justify opposite
// conclusions. Links and packages contribute COUNTS only -- serializing the arrays would let a
// pathological status response blow the all-or-nothing metadata bound and take the whole record
// with it, and the status contract at this layer carries no names, files, URLs or paths anyway.
func jdRemovedMetadata(hoster string, stage exitReason, status *jdownloader.DestinationStatus) map[string]any {
	metadata := map[string]any{
		"hoster":      hoster,
		"stage":       string(stage),
		"statusKnown": status != nil,
	}
	if status == nil {
		return metadata
	}
	metadata["matched"] = status.Matched
	metadata["verdict"] = verdictName(classifyJDStatus(*status))
	metadata["crawlOnline"] = status.CrawlOnlineCount
	metadata["crawlOffline"] = status.CrawlOfflineCount
	metadata["links"] = len(status.Links)
	metadata["packages"] = len(status.PackageSignals)
	metadata["anyFinished"] = anyFinishedSignal(*status)
	metadata["anyRunning"] = anyRunningSignal(*status)
	return metadata
}

// anyRunningSignal reports whether the status carries at least one actively running link or
// package. It deliberately ignores the crawl online count, which says a link RESOLVED, not that
// anything is transferring.
func anyRunningSignal(status jdownloader.DestinationStatus) bool {
	for _, link := range status.Links {
		if link.Running {
			return true
		}
	}
	for _, pkg := range status.PackageSignals {
		if pkg.RunningObserved && pkg.Running {
			return true
		}
	}
	return false
}

// probeMetadata renders a probe timeline into the serializable shape persisted metadata needs.
// probe's fields are unexported, so marshalling the structs directly would persist empty objects.
// The array is bounded at 3 by the detect phase's own schedule, which is what keeps the record
// under the persistence bound by construction.
func probeMetadata(probes []probe) []map[string]any {
	out := make([]map[string]any, 0, len(probes))
	for _, p := range probes {
		out = append(out, map[string]any{"elapsedMs": p.elapsedMs, "found": p.found})
	}
	return out
}
