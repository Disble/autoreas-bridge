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
// how many rows it has. The list badge reads "3x" as three anime, so a summary row -- which
// stands for several things rather than one -- has to contribute what it stands for MINUS
// whatever is already in the record under its own name.
//
// There are two shapes of summary row, and that subtraction is what tells them apart:
//
//   - A TRAILING one stands in for things the record does not carry at all (a season batch past
//     its name limit, a readiness list past its row limit). Nothing follows it, so it contributes
//     its full count.
//   - A LEADING one HEADS a group whose rows are right there under it, since
//     internal/download/service_notification_rows.go stopped discarding the anime it collapsed.
//     Those rows count themselves, so the heading contributes only the remainder -- zero for a
//     run that fits, and the anime it could not carry for one that does not.
//
// The producers' shared layout is what makes that decidable on the wire: a summary row owns every
// row that follows it. The clamp keeps an understated heading -- one standing for fewer things
// than the rows beneath it, which no producer emits -- from subtracting from the badge.
func countNotificationSubjects(rows []center.DetailRow) int {
	total := 0
	for i, row := range rows {
		if row.CollapsedCount == 0 {
			total++
			continue
		}
		total += max(row.CollapsedCount-(len(rows)-i-1), 0)
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
