package download

import (
	"fmt"

	"autoreas-bridge/internal/api/contracts"
)

// This file owns one rule: a run notification's BODY states its own numbers.
//
// # Why the body and not the rows
//
// The same notification is projected onto three surfaces (ADR-016), and the Windows toast is the
// one that has to fit. Its adapter folds every row into a single `<text>` element that carries no
// `hint-maxLines` (`tmpl/xml.go.tmpl` in git.sr.ht/~jackmordaunt/go-toast/v2), so Windows wraps
// the whole thing and clips it at its own default. The clip point therefore moves with string
// WIDTH, not with row count: three short anime names fit where two long ones already overflow.
//
// The consequence is that a fact carried only by the rows is a fact the user may never see, and
// which rows survive is not something this side can predict. The body's first line is the one
// part no wrap can push off the notification -- so every count belongs there, and the rows carry
// the detail behind it.
//
// "Download run completed" never had the defect: its body already led with "3 episode(s)
// downloaded". "Download run started" did, and so did both failure branches, which described
// their scale in prose ("Some animes failed") that a reader cannot turn back into a number.

// runStartedBody is the sentence announcing a run, stating how many anime it queued.
//
// It counts the ADDRESSABLE anime rather than everything the selection returned, so the number
// matches the rows the record will actually carry -- buildRunStartedRows drops an anime with no
// id, because a row that addresses no record renders as cover art that never arrives.
//
// A failed selection degrades to the count-less sentence this notification used to be. RunOnce
// announces the run even when the catalog query fails, and at that point nothing knows how many
// anime there were: printing a zero would claim the run found nothing to do, which is a
// different and false story from "the run could not look".
func runStartedBody(trigger string, animes []contracts.MobileAnime, selectionErr error) string {
	if selectionErr != nil {
		return fmt.Sprintf("Download check started (%s).", trigger)
	}
	return fmt.Sprintf("Download check started (%s) -- %d anime queued.", trigger, len(addressableAnimes(animes)))
}

// runPartialFailureBody reports a run where some anime failed and others did not.
//
// It states both numbers because only the pair is actionable: "some animes failed" is equally
// true of one failure out of twelve and eleven out of twelve, and those call for opposite
// reactions from the reader.
func runPartialFailureBody(outcomes []animeRunOutcome) string {
	return fmt.Sprintf("%d of %d animes failed to download.", countFailedOutcomes(outcomes), len(outcomes))
}

// runTotalFailureBody reports a run where every anime failed.
//
// "All" already says the proportion, so the number it adds is the SCALE -- one anime failing and
// forty failing are the same sentence otherwise, and only one of them is worth interrupting
// someone for.
func runTotalFailureBody(outcomes []animeRunOutcome) string {
	return fmt.Sprintf("All %d animes failed to download.", len(outcomes))
}

// countFailedOutcomes counts the anime whose outcome failed, which is never the same as counting
// the outcomes: the partial branch is reached precisely when those two numbers differ.
func countFailedOutcomes(outcomes []animeRunOutcome) int {
	failed := 0
	for _, outcome := range outcomes {
		if outcome.failed {
			failed++
		}
	}
	return failed
}

// addressableAnimes keeps the anime a notification row can actually address.
//
// Shared by runStartedBody and buildRunStartedRows on purpose. They are the two halves of one
// notification -- the sentence and the subjects it counts -- and letting each apply its own
// filter is exactly how a body comes to promise four anime over a record that names three.
func addressableAnimes(animes []contracts.MobileAnime) []contracts.MobileAnime {
	addressable := make([]contracts.MobileAnime, 0, len(animes))
	for _, anime := range animes {
		if anime.ID != "" {
			addressable = append(addressable, anime)
		}
	}
	return addressable
}
