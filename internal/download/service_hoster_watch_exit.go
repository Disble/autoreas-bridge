package download

import "autoreas-bridge/internal/download/jdownloader"

// exitReason names the exact terminal point that produced a hoster attempt's outcome.
//
// It is a defined string type rather than an iota enum on purpose: the value reaches persisted
// metadata, and a string zero value means "never stamped" instead of silently denoting a real
// terminal point. The named type still prevents an arbitrary string from being assigned at a
// stamp site.
//
// The enum is closed at 17 values. This slice declares only the four removal stages that the
// jdRemove sites use; the remaining values arrive with the attempt-level exit stamps, together
// with the empty "never stamped" value that discriminates "no attempt ever ran" from "every
// attempt failed". Each value lands in the commit that first uses it, because an unused
// unexported constant fails the repo's lint gate.
type exitReason string

const (
	// exitPrecheckDead is the pre-check removal: JD already reported the hoster dead before
	// the 60s grace even started.
	exitPrecheckDead exitReason = "precheck_dead"
	// exitGraceQueryErrorFirst is the post-grace removal that follows a FAILED status query on
	// the first hoster. No status was observed, so the removal is blind.
	exitGraceQueryErrorFirst exitReason = "grace_query_error_first"
	// exitGraceClassifiedDead is the post-grace removal over a status the classifier read as
	// dead.
	exitGraceClassifiedDead exitReason = "grace_classified_dead"
	// exitGraceNoSignalFirst is the post-grace removal on the first hoster when the status
	// carried neither a dead verdict nor any positive signal.
	exitGraceNoSignalFirst exitReason = "grace_no_signal_first"
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
