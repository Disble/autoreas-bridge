//go:build windows

package notification

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// TestWindowsToastKeepsARowOnOneRenderedLine is the vertical half of the fitting problem.
//
// The body budget decides how many rows are SENT. This decides what each one costs on arrival:
// Windows wraps the single text element it was handed, so an untrimmed 76-rune row takes the
// room two short ones would, and a run that queued three anime renders like a run that queued
// two. That is the exact pair of captures this bound came from.
//
// The lengths are literals rather than expressions over the production constants: a case that
// recomputed itself from desktopToastRowLineLimit would follow the constant wherever it drifted
// and report success from either side of it.
func TestWindowsToastKeepsARowOnOneRenderedLine(t *testing.T) {
	t.Parallel()

	line := desktopToastRowLine("Download check started (scheduled) -- 3 anime queued.", DetailItem{
		RefType: "anime",
		RefID:   "a-1",
		Name:    "Nijuuseiki Denki Mokuroku: Eureka Evrika",
		Status:  "queued",
		Detail:  "waiting for this run to reach it",
	})

	if line != "Nijuuseiki De… -- waiting for this run to reach it" {
		t.Fatalf("line = %q, want the name shortened to keep the row on one rendered line", line)
	}
	if utf8.RuneCountInString(line) != 50 {
		t.Fatalf("line spends %d runes, want it to land on the one-line bound", utf8.RuneCountInString(line))
	}
}

// TestWindowsToastLeavesAShortNameAlone: the shortening is a fit, not a house style. A name that
// already fits is not improved by an ellipsis.
func TestWindowsToastLeavesAShortNameAlone(t *testing.T) {
	t.Parallel()

	line := desktopToastRowLine("2 episode(s) downloaded.", DetailItem{
		RefType: "anime",
		RefID:   "a-1",
		Name:    "Frieren",
		Status:  "downloaded",
		Detail:  "Episode 19 -- ready to watch",
	})

	if line != "Frieren -- Episode 19 -- ready to watch" {
		t.Fatalf("line = %q, want a name that already fits left untouched", line)
	}
}

// TestWindowsToastLeavesANameThatExactlyFitsAlone pins the boundary of that rule. A name filling
// the last rune available to it is a name that fits, and shortening it would spend the ellipsis
// to save nothing -- the shortened line is the same width, one real character poorer.
//
// With this detail (32 runes) and the separator (4), a name has 14 runes to work with.
func TestWindowsToastLeavesANameThatExactlyFitsAlone(t *testing.T) {
	t.Parallel()

	line := desktopToastRowLine("Some run body.", DetailItem{
		RefType: "anime",
		RefID:   "a-1",
		Name:    strings.Repeat("N", 14),
		Status:  "queued",
		Detail:  "waiting for this run to reach it",
	})

	if line != strings.Repeat("N", 14)+" -- waiting for this run to reach it" {
		t.Fatalf("line = %q, want a name that exactly fits carried whole", line)
	}
}

// TestWindowsToastNeverShortensTheDetail pins which half gives way. The detail is the sentence
// saying what happened -- half of it is not a smaller truth but a different one -- so a long
// detail pushes the name down to its floor and then the line is allowed to wrap.
//
// A name at the floor is deliberately still eleven characters plus the mark. "T…" would fit any
// line and identify no anime, which is not a fit, it is a deletion with punctuation.
func TestWindowsToastNeverShortensTheDetail(t *testing.T) {
	t.Parallel()

	detail := "3 episode(s) failed (site listing unavailable)"

	line := desktopToastRowLine("Some run body.", DetailItem{
		RefType: "anime",
		RefID:   "a-1",
		Name:    "Tensei shitara Slime Datta Ken 4th Season",
		Status:  "failed",
		Detail:  detail,
	})

	if !strings.HasSuffix(line, detail) {
		t.Fatalf("line = %q, want the detail carried whole", line)
	}
	if line != "Tensei shit… -- 3 episode(s) failed (site listing unavailable)" {
		t.Fatalf("line = %q, want the name held at its floor rather than erased", line)
	}
}

// TestWindowsToastShortensANameCarryingNoDetail covers the other arm: a row with a name and
// nothing else spends no runes on a separator, so it gets the whole line to itself.
func TestWindowsToastShortensANameCarryingNoDetail(t *testing.T) {
	t.Parallel()

	line := desktopToastRowLine("Some run body.", DetailItem{
		RefType: "anime",
		RefID:   "a-1",
		Name:    strings.Repeat("N", 80),
		Status:  "queued",
	})

	if utf8.RuneCountInString(line) != 50 {
		t.Fatalf("line spends %d runes, want the full one-line bound with no separator to pay for", utf8.RuneCountInString(line))
	}
	if !strings.HasSuffix(line, "…") {
		t.Fatalf("line = %q, want the shortening marked", line)
	}
}

// TestWindowsToastShortensNamesByRunesNotBytes: an anime name is not ASCII, and cutting a
// multi-byte name by byte index splits a character into mojibake.
func TestWindowsToastShortensNamesByRunesNotBytes(t *testing.T) {
	t.Parallel()

	line := desktopToastRowLine("Some run body.", DetailItem{
		RefType: "anime",
		RefID:   "a-1",
		Name:    strings.Repeat("日", 40),
		Status:  "queued",
		Detail:  "waiting for this run to reach it",
	})

	if !utf8.ValidString(line) {
		t.Fatalf("shortening split a character: %q", line)
	}
	if line != strings.Repeat("日", 13)+"… -- waiting for this run to reach it" {
		t.Fatalf("line = %q, want 13 whole characters kept", line)
	}
}
