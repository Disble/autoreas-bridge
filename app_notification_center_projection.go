package main

import (
	"autoreas-bridge/internal/notification/center"
)

// notificationSubjectLimit caps how many row names one master-list item carries. The list is a
// scannable index, not the detail pane: a run can touch fifty anime, and shipping fifty strings
// on every item of every page would make the cheap read expensive to serve exactly the sentence
// the frontend then truncates to fit one line anyway.
const notificationSubjectLimit = 3

// countNotificationSubjects reports how many THINGS a record is about, which is not the same as
// how many rows it has: a collapsed summary row stands in for the anime it deliberately does not
// name, so it contributes that number rather than one. The list badge reads "3x" as three anime.
//
// Written as a clamp rather than an `if row.CollapsedCount > 0` branch because that branch is
// unprovable: at a collapsed count of exactly 1 both arms add 1, and above it both take the same
// arm, so no test can tell `> 0` from `> 1`. "Every row counts as what it stands for, minimum
// one" is the same rule with no boundary to get wrong.
func countNotificationSubjects(rows []center.DetailRow) int {
	total := 0
	for _, row := range rows {
		total += max(row.CollapsedCount, 1)
	}
	return total
}

// notificationSubjects returns up to notificationSubjectLimit row names, in row order, for the
// list's "what is this about" line. A row with no name (the collapsed summary row) names nothing
// and is skipped rather than contributing an empty string the frontend would render as a gap.
func notificationSubjects(rows []center.DetailRow) []string {
	var subjects []string
	for _, row := range rows {
		if row.Name == "" {
			continue
		}
		subjects = append(subjects, row.Name)
		if len(subjects) == notificationSubjectLimit {
			break
		}
	}
	return subjects
}
