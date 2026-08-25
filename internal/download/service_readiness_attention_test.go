package download

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/notification"
)

// blockedReadinessItem builds one scheduled-today, not-ready readiness item.
func blockedReadinessItem(id, name string, reasons ...contracts.DownloadReadinessReason) contracts.AnimeDownloadReadiness {
	return contracts.AnimeDownloadReadiness{AnimeID: id, Name: name, Ready: false, Reasons: reasons, ScheduledToday: true}
}

// readinessAttentionDeps builds service deps whose readiness seam returns the given items, plus
// the notifier the assertions read back. The catalog is deliberately left empty: the attention
// notice is raised from the run's own trigger, before selection, so a test that also had to
// stage a matching catalog would be asserting two things at once.
func readinessAttentionDeps(t *testing.T, items ...contracts.AnimeDownloadReadiness) (ServiceDeps, *svcFakeNotifier) {
	t.Helper()
	deps := baseDeps(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	deps.Readiness = func(context.Context) (contracts.DownloadReadinessSnapshot, error) {
		return contracts.DownloadReadinessSnapshot{Items: append([]contracts.AnimeDownloadReadiness(nil), items...)}, nil
	}
	return deps, notifier
}

// runOnceForReadiness executes one run with the given trigger and returns the attention
// notification it raised, or nil when it raised none.
func runOnceForReadiness(t *testing.T, deps ServiceDeps, notifier *svcFakeNotifier, trigger string) *notification.Notification {
	t.Helper()
	if _, err := NewService(deps).RunOnce(context.Background(), trigger); err != nil {
		t.Fatalf("RunOnce(%q): %v", trigger, err)
	}
	return findNotificationByTitle(notifier, "Scheduled anime need attention")
}

// blockedReadinessItems builds count distinct scheduled-and-blocked readiness items.
func blockedReadinessItems(count int) []contracts.AnimeDownloadReadiness {
	items := make([]contracts.AnimeDownloadReadiness, 0, count)
	for i := 0; i < count; i++ {
		items = append(items, blockedReadinessItem(
			fmt.Sprintf("anime-%02d", i),
			fmt.Sprintf("Anime %02d", i),
			contracts.DownloadReadinessMissingSource,
		))
	}
	return items
}

// countReadinessRows splits a notification's rows into how many anime it names individually and
// how many it stands in for through the summary row.
func countReadinessRows(rows []notification.DetailItem) (named, collapsed int) {
	for _, row := range rows {
		if row.CollapsedCount > 0 {
			collapsed += row.CollapsedCount
			continue
		}
		named++
	}
	return named, collapsed
}

// partitionActionsByLevel splits a notification's tokens into the two levels the detail pane
// renders them at: the ones bound to a row, and the whole-notification ones the footer shows.
//
// It exists because asserting on a raw count stopped meaning anything once a notification could
// carry both -- "one action" was only ever shorthand for "one row-bound action".
func partitionActionsByLevel(actions []notification.ActionSpec) (rowBound, unbound []notification.ActionSpec) {
	for _, action := range actions {
		if action.RowRef == "" {
			unbound = append(unbound, action)
			continue
		}
		rowBound = append(rowBound, action)
	}
	return rowBound, unbound
}

// TestScheduledRunWarnsAboutBlockedScheduledAnime is the notification's whole anatomy on the
// only trigger that raises it: identity, level, the per-anime rows the design canvas draws, and
// the editor route frozen into each row's own action.
func TestScheduledRunWarnsAboutBlockedScheduledAnime(t *testing.T) {
	t.Parallel()

	deps, notifier := readinessAttentionDeps(t,
		blockedReadinessItem("anime-eureka", "Nijuuseiki Denki Mokuroku: Eureka", contracts.DownloadReadinessMissingSource),
	)

	got := runOnceForReadiness(t, deps, notifier, "scheduled")
	if got == nil {
		t.Fatal("scheduled run raised no readiness attention notification")
	}
	if got.Kind != "readiness_attention" {
		t.Fatalf("Kind = %q, want readiness_attention", got.Kind)
	}
	if got.Level != "warning" {
		t.Fatalf("Level = %q, want warning", got.Level)
	}
	if got.Source != "download" {
		t.Fatalf("Source = %q, want download", got.Source)
	}
	if got.CorrelationID != "run-fixed" {
		t.Fatalf("CorrelationID = %q, want the run id", got.CorrelationID)
	}
	if len(got.Rows) != 1 {
		t.Fatalf("Rows = %#v, want exactly one row", got.Rows)
	}
	row := got.Rows[0]
	if row.RefType != "anime" || row.RefID != "anime-eureka" || row.Name != "Nijuuseiki Denki Mokuroku: Eureka" {
		t.Fatalf("row identity = %#v, want it to name the blocked anime", row)
	}
	if row.Status != "blocked" {
		t.Fatalf("row Status = %q, want blocked", row.Status)
	}
	if row.Detail != "Missing source -- it will be skipped on every scheduled run until you set one" {
		t.Fatalf("row Detail = %q, want the canvas sentence for a missing source", row.Detail)
	}
	rowBound, _ := partitionActionsByLevel(got.Actions)
	if len(rowBound) != 1 {
		t.Fatalf("row-bound actions = %#v, want exactly one -- the row's own", got.Actions)
	}
	action := rowBound[0]
	if action.Label != "Open in editor" || action.Intent != "navigation.open" {
		t.Fatalf("action = %#v, want an Open in editor navigation token", action)
	}
	if action.RowRef != "anime-eureka" {
		t.Fatalf("action RowRef = %q, want it bound to the row it belongs to", action.RowRef)
	}
	if action.Args["route"] != "/editor/anime-eureka" {
		t.Fatalf("action route = %q, want the editor route frozen for that anime", action.Args["route"])
	}
}

// TestReadinessAttentionBodyCountsTheBlockedAnime pins the body sentence: the canvas moved the
// count out of a chip and back into prose, so the number has to be in the body.
func TestReadinessAttentionBodyCountsTheBlockedAnime(t *testing.T) {
	t.Parallel()

	deps, notifier := readinessAttentionDeps(t,
		blockedReadinessItem("a1", "One", contracts.DownloadReadinessMissingSource),
		blockedReadinessItem("a2", "Two", contracts.DownloadReadinessInvalidSource),
		contracts.AnimeDownloadReadiness{AnimeID: "a3", Name: "Three", Ready: true, ScheduledToday: true},
	)

	got := runOnceForReadiness(t, deps, notifier, "scheduled")
	if got == nil {
		t.Fatal("scheduled run raised no readiness attention notification")
	}
	if got.Body != "2 scheduled anime cannot download and will be skipped on this run." {
		t.Fatalf("Body = %q, want it to count only the blocked anime", got.Body)
	}
}

// TestManualRunNeverWarnsAboutReadiness holds the firing policy's other half. The notice warns
// that a SCHEDULED run will skip these silently; a manual run is the user standing at the
// controls, so the same catalog state is not news.
func TestManualRunNeverWarnsAboutReadiness(t *testing.T) {
	t.Parallel()

	deps, notifier := readinessAttentionDeps(t,
		blockedReadinessItem("anime-eureka", "Eureka", contracts.DownloadReadinessMissingSource),
	)

	if got := runOnceForReadiness(t, deps, notifier, "manual"); got != nil {
		t.Fatalf("manual run raised %#v, want no readiness attention notification", got)
	}
}

// TestScheduledRunStaysSilentWhenNothingScheduledIsBlocked covers the two ways a catalog earns
// silence -- everything scheduled is ready, and everything blocked is not scheduled. A notice
// that fires on a healthy run is the noise this design exists to avoid.
func TestScheduledRunStaysSilentWhenNothingScheduledIsBlocked(t *testing.T) {
	t.Parallel()

	scenarios := map[string][]contracts.AnimeDownloadReadiness{
		"every scheduled anime is ready": {
			{AnimeID: "a1", Name: "One", Ready: true, ScheduledToday: true},
			{AnimeID: "a2", Name: "Two", Ready: true, ScheduledToday: true},
		},
		"the blocked anime are not scheduled today": {
			{AnimeID: "a1", Name: "One", Ready: false, Reasons: []contracts.DownloadReadinessReason{contracts.DownloadReadinessMissingSource}},
			{AnimeID: "a2", Name: "Two", Ready: true, ScheduledToday: true},
		},
		"the catalog is empty": {},
	}

	for name, items := range scenarios {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			deps, notifier := readinessAttentionDeps(t, items...)
			if got := runOnceForReadiness(t, deps, notifier, "scheduled"); got != nil {
				t.Fatalf("raised %#v, want silence", got)
			}
		})
	}
}

// TestReadinessAttentionNamesTheBlockerPerReason walks the closed reason set. Each blocker gets
// its own sentence saying what is wrong AND what fixes it -- one generic line for all four would
// send the user to the editor without telling them what to change.
func TestReadinessAttentionNamesTheBlockerPerReason(t *testing.T) {
	t.Parallel()

	scenarios := map[string]struct {
		reasons []contracts.DownloadReadinessReason
		want    string
	}{
		"missing source": {
			reasons: []contracts.DownloadReadinessReason{contracts.DownloadReadinessMissingSource},
			want:    "Missing source -- it will be skipped on every scheduled run until you set one",
		},
		"invalid source": {
			reasons: []contracts.DownloadReadinessReason{contracts.DownloadReadinessInvalidSource},
			want:    "Source is not a valid web address -- it will be skipped on every scheduled run until you correct it",
		},
		"unsupported source": {
			reasons: []contracts.DownloadReadinessReason{contracts.DownloadReadinessUnsupportedSource},
			want:    "Source site has no download adapter -- it will be skipped on every scheduled run until you point it at a supported site",
		},
		"destination unresolved": {
			reasons: []contracts.DownloadReadinessReason{contracts.DownloadReadinessDestinationUnresolved},
			want:    "No download folder resolves for it -- it will be skipped on every scheduled run until you set one",
		},
		"no recorded reason": {
			reasons: nil,
			want:    "Not ready to download -- it will be skipped on every scheduled run until you open it and fix it",
		},
		"source blocker outranks the destination one": {
			reasons: []contracts.DownloadReadinessReason{contracts.DownloadReadinessMissingSource, contracts.DownloadReadinessDestinationUnresolved},
			want:    "Missing source -- it will be skipped on every scheduled run until you set one",
		},
	}

	for name, scenario := range scenarios {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			deps, notifier := readinessAttentionDeps(t, blockedReadinessItem("a1", "One", scenario.reasons...))
			got := runOnceForReadiness(t, deps, notifier, "scheduled")
			if got == nil {
				t.Fatal("scheduled run raised no readiness attention notification")
			}
			if got.Rows[0].Detail != scenario.want {
				t.Fatalf("row Detail = %q, want %q", got.Rows[0].Detail, scenario.want)
			}
		})
	}
}

// TestReadinessAttentionRowsAreBounded holds the canvas rule that a notification listing
// everything is a log. The collapse boundary is asserted from both sides, because an
// off-by-one there either hides a named anime or grows an empty summary line.
func TestReadinessAttentionRowsAreBounded(t *testing.T) {
	t.Parallel()

	scenarios := map[string]struct {
		blocked        int
		wantNamed      int
		wantCollapsed  int
		wantSummaryRow bool
	}{
		"one blocked anime is named alone":     {blocked: 1, wantNamed: 1},
		"exactly the limit is all named":       {blocked: 5, wantNamed: 5},
		"one over the limit folds exactly one": {blocked: 6, wantNamed: 5, wantCollapsed: 1, wantSummaryRow: true},
		"a fifty-anime run folds the rest":     {blocked: 50, wantNamed: 5, wantCollapsed: 45, wantSummaryRow: true},
	}

	for name, scenario := range scenarios {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			deps, notifier := readinessAttentionDeps(t, blockedReadinessItems(scenario.blocked)...)
			got := runOnceForReadiness(t, deps, notifier, "scheduled")
			if got == nil {
				t.Fatal("scheduled run raised no readiness attention notification")
			}

			named, collapsed := countReadinessRows(got.Rows)
			if named != scenario.wantNamed || collapsed != scenario.wantCollapsed {
				t.Fatalf("rows named/collapsed = %d/%d, want %d/%d (rows %#v)",
					named, collapsed, scenario.wantNamed, scenario.wantCollapsed, got.Rows)
			}
			if hasSummaryRow := len(got.Rows) > named; hasSummaryRow != scenario.wantSummaryRow {
				t.Fatalf("summary row present = %v, want %v", hasSummaryRow, scenario.wantSummaryRow)
			}
			rowBound, _ := partitionActionsByLevel(got.Actions)
			if len(rowBound) != scenario.wantNamed {
				t.Fatalf("row-bound actions = %d, want one per named row (%d) and none for the summary", len(rowBound), scenario.wantNamed)
			}
		})
	}
}

// TestReadinessAttentionCollapsedRowNamesItsCohort keeps the summary line honest: it stands in
// for anime it does not name, so it has to say how many, and it must carry no action -- there is
// no single anime an editor token could be frozen to.
func TestReadinessAttentionCollapsedRowNamesItsCohort(t *testing.T) {
	t.Parallel()

	deps, notifier := readinessAttentionDeps(t, blockedReadinessItems(8)...)
	got := runOnceForReadiness(t, deps, notifier, "scheduled")
	if got == nil {
		t.Fatal("scheduled run raised no readiness attention notification")
	}

	summary := got.Rows[len(got.Rows)-1]
	if summary.CollapsedCount != 3 {
		t.Fatalf("summary CollapsedCount = %d, want 3", summary.CollapsedCount)
	}
	if summary.Detail != "3 more scheduled anime need attention" {
		t.Fatalf("summary Detail = %q, want it to name the cohort size", summary.Detail)
	}
	if summary.RefID != "" || summary.RefType != "" {
		t.Fatalf("summary row = %#v, want it to reference no single anime", summary)
	}
	// The summary row references no anime, so an action bound to it would land in the same
	// unbound bucket as the notice's own whole-notification token. The bucket must therefore hold
	// exactly that one token and nothing else -- checking only that it is non-empty stopped
	// meaning anything once readiness_attention gained an L1 verb.
	_, unbound := partitionActionsByLevel(got.Actions)
	if len(unbound) != 1 || unbound[0].Label != "See this run" {
		t.Fatalf("unbound actions = %#v, want only the whole-notification token", unbound)
	}
}

// TestReadinessAttentionRepeatsOnEveryScheduledRun pins the firing policy the user chose:
// predictability over silence. Nothing suppresses, dedupes or cools down a second warning about
// the same anime -- it repeats until the anime is fixed.
func TestReadinessAttentionRepeatsOnEveryScheduledRun(t *testing.T) {
	t.Parallel()

	deps, notifier := readinessAttentionDeps(t,
		blockedReadinessItem("anime-eureka", "Eureka", contracts.DownloadReadinessMissingSource),
	)
	service := NewService(deps)

	for i := 0; i < 3; i++ {
		if _, err := service.RunOnce(context.Background(), "scheduled"); err != nil {
			t.Fatalf("RunOnce #%d: %v", i+1, err)
		}
	}

	raised := 0
	for _, n := range notifier.notifications() {
		if n.Kind == "readiness_attention" {
			raised++
		}
	}
	if raised != 3 {
		t.Fatalf("readiness_attention raised %d times across 3 scheduled runs, want 3", raised)
	}
}

// TestReadinessAttentionDegradesWithoutFailingTheRun covers the two ways the seam can give
// nothing back. Both must leave the run itself untouched: this notice is an extra, and a
// download run that stops because a warning could not be built has traded a real capability for
// an advisory one.
func TestReadinessAttentionDegradesWithoutFailingTheRun(t *testing.T) {
	t.Parallel()

	scenarios := map[string]func(*ServiceDeps){
		"no readiness dependency wired": func(deps *ServiceDeps) { deps.Readiness = nil },
		"the readiness query fails": func(deps *ServiceDeps) {
			deps.Readiness = func(context.Context) (contracts.DownloadReadinessSnapshot, error) {
				return contracts.DownloadReadinessSnapshot{}, errors.New("catalog unavailable")
			}
		},
	}

	for name, degrade := range scenarios {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			deps, notifier := readinessAttentionDeps(t,
				blockedReadinessItem("anime-eureka", "Eureka", contracts.DownloadReadinessMissingSource),
			)
			degrade(&deps)

			result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
			if err != nil {
				t.Fatalf("RunOnce: %v", err)
			}
			if result.Status != "no_animes_today" {
				t.Fatalf("run Status = %q, want the run to have completed normally", result.Status)
			}
			if got := findNotificationByTitle(notifier, "Scheduled anime need attention"); got != nil {
				t.Fatalf("raised %#v, want silence", got)
			}
		})
	}
}
