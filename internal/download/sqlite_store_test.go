package download

import (
	"context"
	"database/sql"
	"path/filepath"
	"runtime"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

func openTestBridgeDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open test bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}

// --- Hoster priority CRUD + seed ---

func TestSQLiteStoreSeedsHosterPriorityOnlyWhenEmpty(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	seed := []HosterPriorityEntry{
		{Hoster: "Mediafire", Priority: 0, Enabled: true},
		{Hoster: "Mega", Priority: 1, Enabled: true},
	}
	if err := store.SeedHosterPriorityIfEmpty(ctx, "jkanime", seed); err != nil {
		t.Fatalf("seed: %v", err)
	}

	got, err := store.ListHosterPriority(ctx, "jkanime")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 seeded rows, got %d", len(got))
	}

	// Seeding again after a user reorder MUST NOT overwrite the user's ordering.
	if err := store.SetHosterPriority(ctx, "jkanime", []HosterPriorityEntry{
		{Hoster: "Mega", Priority: 0, Enabled: true},
		{Hoster: "Mediafire", Priority: 1, Enabled: true},
	}); err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := store.SeedHosterPriorityIfEmpty(ctx, "jkanime", seed); err != nil {
		t.Fatalf("re-seed: %v", err)
	}

	got, err = store.ListHosterPriority(ctx, "jkanime")
	if err != nil {
		t.Fatalf("list after re-seed: %v", err)
	}
	if len(got) != 2 || got[0].Hoster != "Mega" || got[0].Priority != 0 {
		t.Fatalf("expected user ordering preserved (Mega first), got %#v", got)
	}
}

func TestSQLiteStoreSetHosterPriorityReplacesExistingOrdering(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SetHosterPriority(ctx, "jkanime", []HosterPriorityEntry{
		{Hoster: "Mediafire", Priority: 0, Enabled: true},
	}); err != nil {
		t.Fatalf("first set: %v", err)
	}
	if err := store.SetHosterPriority(ctx, "jkanime", []HosterPriorityEntry{
		{Hoster: "Mega", Priority: 0, Enabled: true},
		{Hoster: "Mediafire", Priority: 1, Enabled: false},
	}); err != nil {
		t.Fatalf("second set: %v", err)
	}

	got, err := store.ListHosterPriority(ctx, "jkanime")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected exactly 2 rows after replace, got %d (%#v)", len(got), got)
	}
}

func TestSQLiteStoreListHosterPriorityIsEmptyForUnknownSite(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)

	got, err := store.ListHosterPriority(context.Background(), "unknown-site")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 rows for an unconfigured site, got %d", len(got))
	}
}

// --- JD config: password write-only / never returned in cleartext ---

func TestSQLiteStoreGetJDConfigNeverReturnsCleartextPassword(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	password := "super-secret-myjd-password"
	cfg := JDConfig{Email: "user@example.com", DeviceName: "MyPC", DefaultDestDir: "C:/anime"}
	if err := store.SetJDConfig(ctx, cfg, &password); err != nil {
		t.Fatalf("SetJDConfig: %v", err)
	}

	got, err := store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if !got.HasPassword {
		t.Fatal("expected HasPassword=true after setting a password")
	}
	if got.Email != cfg.Email || got.DeviceName != cfg.DeviceName {
		t.Fatalf("expected non-secret fields to round-trip, got %#v", got)
	}

	// JDConfig has no field capable of carrying a cleartext password at all -- this is a
	// structural guarantee, not just an unasserted absence. We additionally assert via
	// DecryptedPassword that the real plaintext is retrievable ONLY through that dedicated,
	// non-UI-facing seam.
	plain, ok, err := store.DecryptedPassword(ctx)
	if err != nil {
		t.Fatalf("DecryptedPassword: %v", err)
	}
	if !ok {
		t.Fatal("expected DecryptedPassword ok=true")
	}
	if plain != password {
		t.Fatalf("expected DecryptedPassword to round-trip the original password, got %q", plain)
	}
}

func TestSQLiteStoreSetJDConfigWithNilPasswordLeavesExistingPasswordUnchanged(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	password := "original-password"
	if err := store.SetJDConfig(ctx, JDConfig{Email: "a@b.com", DeviceName: "PC1"}, &password); err != nil {
		t.Fatalf("first SetJDConfig: %v", err)
	}

	// Edit email/device WITHOUT re-entering the password (nil plaintextPassword).
	if err := store.SetJDConfig(ctx, JDConfig{Email: "new@b.com", DeviceName: "PC2"}, nil); err != nil {
		t.Fatalf("second SetJDConfig with nil password: %v", err)
	}

	got, err := store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if got.Email != "new@b.com" || got.DeviceName != "PC2" {
		t.Fatalf("expected updated non-secret fields, got %#v", got)
	}
	if !got.HasPassword {
		t.Fatal("expected HasPassword still true (existing blob untouched)")
	}

	plain, ok, err := store.DecryptedPassword(ctx)
	if err != nil {
		t.Fatalf("DecryptedPassword: %v", err)
	}
	if !ok || plain != password {
		t.Fatalf("expected original password preserved, got ok=%v plain=%q", ok, plain)
	}
}

func TestSQLiteStoreGetJDConfigHasPasswordFalseWhenNoneStored(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SetJDConfig(ctx, JDConfig{Email: "a@b.com"}, nil); err != nil {
		t.Fatalf("SetJDConfig: %v", err)
	}

	got, err := store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if got.HasPassword {
		t.Fatal("expected HasPassword=false when no password has ever been set")
	}

	_, ok, err := store.DecryptedPassword(ctx)
	if err != nil {
		t.Fatalf("DecryptedPassword: %v", err)
	}
	if ok {
		t.Fatal("expected DecryptedPassword ok=false when no password is stored")
	}
}

// TestSQLiteStoreStoredPasswordBlobIsNotPlaintextOnWindows is Windows-gated (real DPAPI):
// asserts the BLOB persisted in download_jd_config.myjd_password_encrypted never contains the
// plaintext password bytes, proving the column genuinely stores DPAPI ciphertext rather than
// an unencrypted copy (download-config spec "Credentials are saved"; design §4.3/§7).
func TestSQLiteStoreStoredPasswordBlobIsNotPlaintextOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("DPAPI ciphertext assertion is Windows-gated; skipping on " + runtime.GOOS)
	}
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	password := "super-secret-myjd-password"
	if err := store.SetJDConfig(ctx, JDConfig{Email: "a@b.com"}, &password); err != nil {
		t.Fatalf("SetJDConfig: %v", err)
	}

	var blob []byte
	if err := db.QueryRowContext(ctx, `SELECT myjd_password_encrypted FROM download_jd_config WHERE id = 1`).Scan(&blob); err != nil {
		t.Fatalf("query stored blob: %v", err)
	}
	if len(blob) == 0 {
		t.Fatal("expected a non-empty stored blob")
	}
	if containsBytes(blob, []byte(password)) {
		t.Fatal("expected the stored blob to NEVER contain the plaintext password bytes")
	}
}

func containsBytes(haystack, needle []byte) bool {
	if len(needle) == 0 || len(haystack) < len(needle) {
		return false
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := range needle {
			if haystack[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

// --- Schedule config round-trip ---

func TestSQLiteStoreScheduleConfigRoundTrips(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	cfg := ScheduleConfig{
		Mode:          "in_process",
		DailyTimeHHMM: "03:30",
		Enabled:       true,
	}
	if err := store.SetScheduleConfig(ctx, cfg); err != nil {
		t.Fatalf("SetScheduleConfig: %v", err)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.Mode != cfg.Mode || got.DailyTimeHHMM != cfg.DailyTimeHHMM || got.Enabled != cfg.Enabled {
		t.Fatalf("expected round-tripped config %#v, got %#v", cfg, got)
	}

	if err := store.MarkScheduleRun(ctx, 1000, "ok", 2000); err != nil {
		t.Fatalf("MarkScheduleRun: %v", err)
	}

	got, err = store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig after mark: %v", err)
	}
	if got.LastRunAtMs != 1000 || got.LastRunStatus != "ok" || got.NextRunAtMs != 2000 {
		t.Fatalf("expected MarkScheduleRun fields to persist, got %#v", got)
	}
}

func TestSQLiteStoreGetScheduleConfigReturnsDisabledDefaultWhenNeverSet(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)

	got, err := store.GetScheduleConfig(context.Background())
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.Enabled {
		t.Fatal("expected schedule to default to disabled (rollback-safe dormant state)")
	}
	if got.EnabledWeekdays != 127 {
		t.Fatalf("expected EnabledWeekdays to default to 127 (all days) when no row exists, got %d", got.EnabledWeekdays)
	}
}

// TestSQLiteStoreGetScheduleConfigDefaultsEnabledWeekdaysTo127WhenColumnIsNull asserts the
// backward-compat read-path default for a legacy row that was persisted (via a direct SQL
// insert simulating a pre-existing row, or a SetScheduleConfig predating this column) with
// enabled_weekdays left NULL -- it MUST read back as 127 (all days enabled), per design.md
// "NULL column defaults to 127 in the READ path".
func TestSQLiteStoreGetScheduleConfigDefaultsEnabledWeekdaysTo127WhenColumnIsNull(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	// Simulate a legacy row: insert directly via SQL, bypassing SetScheduleConfig, leaving
	// enabled_weekdays NULL (its column default -- no DEFAULT clause in the DDL).
	if _, err := db.ExecContext(ctx, `
		INSERT INTO download_schedule_config (id, mode, daily_time_hhmm, enabled)
		VALUES (1, 'in_process', '09:00', 1)
	`); err != nil {
		t.Fatalf("insert legacy-shaped row: %v", err)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.EnabledWeekdays != 127 {
		t.Fatalf("expected EnabledWeekdays = 127 for a NULL column, got %d", got.EnabledWeekdays)
	}
}

// TestSQLiteStoreScheduleConfigEnabledWeekdaysRoundTripsArbitraryMask asserts SetScheduleConfig
// persists the EXACT mask passed and GetScheduleConfig returns it unchanged -- no upgrade to
// 127, no loss of bits (design.md "Round-trip preserves an arbitrary weekday subset").
func TestSQLiteStoreScheduleConfigEnabledWeekdaysRoundTripsArbitraryMask(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	// Thu(4)/Fri(5)/Sat(6)/Sun(0) per time.Weekday encoding.
	const mask byte = (1 << 4) | (1 << 5) | (1 << 6) | (1 << 0)

	if err := store.SetScheduleConfig(ctx, ScheduleConfig{
		Mode:            "in_process",
		DailyTimeHHMM:   "09:00",
		Enabled:         true,
		EnabledWeekdays: mask,
	}); err != nil {
		t.Fatalf("SetScheduleConfig: %v", err)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.EnabledWeekdays != mask {
		t.Fatalf("expected EnabledWeekdays = %d, got %d", mask, got.EnabledWeekdays)
	}
}

// TestSQLiteStoreScheduleConfigEnabledWeekdaysRoundTripsEmptyMask asserts an explicit EMPTY
// mask (0, "no day enabled") round-trips as 0 -- it must NOT be silently upgraded to 127
// (design.md "Round-trip preserves an empty weekday set"; the 127 default applies ONLY to a
// NULL/absent column, never to an explicitly-persisted 0).
func TestSQLiteStoreScheduleConfigEnabledWeekdaysRoundTripsEmptyMask(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SetScheduleConfig(ctx, ScheduleConfig{
		Mode:            "in_process",
		DailyTimeHHMM:   "09:00",
		Enabled:         true,
		EnabledWeekdays: 0,
	}); err != nil {
		t.Fatalf("SetScheduleConfig: %v", err)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.EnabledWeekdays != 0 {
		t.Fatalf("expected EnabledWeekdays = 0 (explicit empty mask), got %d", got.EnabledWeekdays)
	}
}

// --- download_runs: OpenRun / FinalizeRun / ListRuns ---

func TestSQLiteStoreOpenRunWritesProvisionalRunningStatus(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	run := DownloadRun{RunID: "run-1", StartedAtMs: 100, Trigger: "manual"}
	if err := store.OpenRun(ctx, run); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}

	var status string
	var finishedAtMs sql.NullInt64
	if err := db.QueryRowContext(ctx, `SELECT status, finished_at_ms FROM download_runs WHERE run_id = ?`, "run-1").
		Scan(&status, &finishedAtMs); err != nil {
		t.Fatalf("query run row: %v", err)
	}
	if status != "running" {
		t.Fatalf("expected provisional status 'running', got %q", status)
	}
	if finishedAtMs.Valid {
		t.Fatal("expected finished_at_ms to be NULL for an open run")
	}
}

func TestSQLiteStoreUpdateRunProgressRefreshesRunningCounters(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.OpenRun(ctx, DownloadRun{RunID: "run-1", StartedAtMs: 100, Trigger: "manual"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}

	if err := store.UpdateRunProgress(ctx, DownloadRun{
		RunID:              "run-1",
		StartedAtMs:        100,
		Trigger:            "manual",
		AnimesChecked:      2,
		EpisodesFound:      2,
		EpisodesDownloaded: 1,
		JDAvailable:        true,
		Status:             "running",
	}); err != nil {
		t.Fatalf("UpdateRunProgress: %v", err)
	}

	runs, err := store.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	got := runs[0]
	if got.FinishedAtMs != nil || got.Status != "running" {
		t.Fatalf("expected run to remain non-terminal running, got %#v", got)
	}
	if got.AnimesChecked != 2 || got.EpisodesFound != 2 || got.EpisodesDownloaded != 1 || !got.JDAvailable {
		t.Fatalf("expected live progress counters to persist, got %#v", got)
	}
}

func TestSQLiteStoreFinalizeRunSetsTerminalStatusAndFinishedAt(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.OpenRun(ctx, DownloadRun{RunID: "run-1", StartedAtMs: 100, Trigger: "manual"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}

	finishedAt := int64(500)
	if err := store.FinalizeRun(ctx, DownloadRun{
		RunID:              "run-1",
		StartedAtMs:        100,
		FinishedAtMs:       &finishedAt,
		Trigger:            "manual",
		AnimesChecked:      3,
		EpisodesDownloaded: 2,
		Status:             "ok",
	}); err != nil {
		t.Fatalf("FinalizeRun: %v", err)
	}

	runs, err := store.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected 1 run, got %d", len(runs))
	}
	got := runs[0]
	if got.Status != "ok" {
		t.Fatalf("expected terminal status 'ok', got %q", got.Status)
	}
	if got.FinishedAtMs == nil || *got.FinishedAtMs != finishedAt {
		t.Fatalf("expected finished_at_ms=%d, got %v", finishedAt, got.FinishedAtMs)
	}
	if got.AnimesChecked != 3 || got.EpisodesDownloaded != 2 {
		t.Fatalf("expected counts to persist, got %#v", got)
	}
}

func TestSQLiteStoreFinalizeRunPersistsManualLinksForJDOffline(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.OpenRun(ctx, DownloadRun{RunID: "run-1", StartedAtMs: 100, Trigger: "scheduled"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}

	finishedAt := int64(200)
	links := []ManualLink{
		{Anime: "Naruto", Episode: 5, Links: []string{"https://mediafire.example/ep5"}},
	}
	if err := store.FinalizeRun(ctx, DownloadRun{
		RunID:        "run-1",
		StartedAtMs:  100,
		FinishedAtMs: &finishedAt,
		Trigger:      "scheduled",
		Status:       "jd_offline",
		ManualLinks:  links,
	}); err != nil {
		t.Fatalf("FinalizeRun: %v", err)
	}

	runs, err := store.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected 1 run, got %d", len(runs))
	}
	got := runs[0]
	if got.Status != "jd_offline" {
		t.Fatalf("expected status jd_offline, got %q", got.Status)
	}
	if len(got.ManualLinks) != 1 || got.ManualLinks[0].Anime != "Naruto" || got.ManualLinks[0].Episode != 5 {
		t.Fatalf("expected manual links to round-trip, got %#v", got.ManualLinks)
	}
	if len(got.ManualLinks[0].Links) != 1 || got.ManualLinks[0].Links[0] != "https://mediafire.example/ep5" {
		t.Fatalf("expected manual link URLs to round-trip, got %#v", got.ManualLinks[0].Links)
	}
}

func TestSQLiteStoreListRunsOrdersMostRecentFirst(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	for i, runID := range []string{"run-a", "run-b", "run-c"} {
		startedAt := int64(100 * (i + 1))
		if err := store.OpenRun(ctx, DownloadRun{RunID: runID, StartedAtMs: startedAt, Trigger: "manual"}); err != nil {
			t.Fatalf("OpenRun %s: %v", runID, err)
		}
		finishedAt := startedAt + 10
		if err := store.FinalizeRun(ctx, DownloadRun{RunID: runID, StartedAtMs: startedAt, FinishedAtMs: &finishedAt, Trigger: "manual", Status: "ok"}); err != nil {
			t.Fatalf("FinalizeRun %s: %v", runID, err)
		}
	}

	runs, err := store.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 3 {
		t.Fatalf("expected 3 runs, got %d", len(runs))
	}
	if runs[0].RunID != "run-c" || runs[1].RunID != "run-b" || runs[2].RunID != "run-a" {
		t.Fatalf("expected most-recent-first order, got %v, %v, %v", runs[0].RunID, runs[1].RunID, runs[2].RunID)
	}
}

// --- Retention: prune to most-recent 200 rows on finalize ---

func TestSQLiteStoreFinalizeRunPrunesToRetentionLimit(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	const total = 201
	for i := 0; i < total; i++ {
		runID := runIDForIndex(i)
		startedAt := int64(i + 1)
		if err := store.OpenRun(ctx, DownloadRun{RunID: runID, StartedAtMs: startedAt, Trigger: "scheduled"}); err != nil {
			t.Fatalf("OpenRun %s: %v", runID, err)
		}
		finishedAt := startedAt + 1
		if err := store.FinalizeRun(ctx, DownloadRun{RunID: runID, StartedAtMs: startedAt, FinishedAtMs: &finishedAt, Trigger: "scheduled", Status: "ok"}); err != nil {
			t.Fatalf("FinalizeRun %s: %v", runID, err)
		}
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM download_runs`).Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 200 {
		t.Fatalf("expected exactly 200 rows after the 201st finalize, got %d", count)
	}

	// The most recently finalized run MUST be retained.
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM download_runs WHERE run_id = ?`, runIDForIndex(total-1)).Scan(&exists); err != nil {
		t.Fatalf("check latest run exists: %v", err)
	}
	if exists != 1 {
		t.Fatal("expected the most recently finalized run to be retained")
	}

	// The single oldest prior run MUST no longer be present.
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM download_runs WHERE run_id = ?`, runIDForIndex(0)).Scan(&exists); err != nil {
		t.Fatalf("check oldest run absent: %v", err)
	}
	if exists != 0 {
		t.Fatal("expected the oldest prior run to have been pruned")
	}
}

func runIDForIndex(i int) string {
	return "run-" + itoa(i)
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	digits := []byte{}
	neg := i < 0
	if neg {
		i = -i
	}
	for i > 0 {
		digits = append([]byte{byte('0' + i%10)}, digits...)
		i /= 10
	}
	if neg {
		return "-" + string(digits)
	}
	return string(digits)
}

// --- Crash-zombie reconciliation ---

func TestSQLiteStoreReconcileInterruptedRunsFinalizesNonTerminalRowsAsInterrupted(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	store := NewSQLiteStore(db)
	ctx := context.Background()

	// Simulate a run that was opened but never finalized (the process "crashed").
	if err := store.OpenRun(ctx, DownloadRun{RunID: "crashed-run", StartedAtMs: 100, Trigger: "scheduled"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}
	_ = db.Close()

	// Simulate "restart": a fresh store opened over the SAME underlying db file.
	db2, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("re-open db: %v", err)
	}
	t.Cleanup(func() { _ = db2.Close() })
	store2 := NewSQLiteStore(db2)

	reconciled, err := store2.ReconcileInterruptedRuns(ctx, 999)
	if err != nil {
		t.Fatalf("ReconcileInterruptedRuns: %v", err)
	}
	if reconciled != 1 {
		t.Fatalf("expected 1 row reconciled, got %d", reconciled)
	}

	runs, err := store2.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected 1 run, got %d", len(runs))
	}
	if runs[0].Status != "interrupted" {
		t.Fatalf("expected status 'interrupted', got %q", runs[0].Status)
	}
	if runs[0].FinishedAtMs == nil {
		t.Fatal("expected finished_at_ms to be set after reconciliation")
	}
	if *runs[0].FinishedAtMs != 999 {
		t.Fatalf("expected finished_at_ms=999, got %d", *runs[0].FinishedAtMs)
	}
}

func TestSQLiteStoreReconcileInterruptedRunsIsNoOpWhenNothingIsInterrupted(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.OpenRun(ctx, DownloadRun{RunID: "run-1", StartedAtMs: 100, Trigger: "manual"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}
	finishedAt := int64(200)
	if err := store.FinalizeRun(ctx, DownloadRun{RunID: "run-1", StartedAtMs: 100, FinishedAtMs: &finishedAt, Trigger: "manual", Status: "ok"}); err != nil {
		t.Fatalf("FinalizeRun: %v", err)
	}

	reconciled, err := store.ReconcileInterruptedRuns(ctx, 999)
	if err != nil {
		t.Fatalf("ReconcileInterruptedRuns: %v", err)
	}
	if reconciled != 0 {
		t.Fatalf("expected 0 rows reconciled when every run is already terminal, got %d", reconciled)
	}
}
