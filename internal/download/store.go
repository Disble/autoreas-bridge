package download

import (
	"context"
)

// JDConfig is the singleton MyJDownloader configuration (download_jd_config, id=1). The
// password is NEVER exposed in cleartext through this type -- HasPassword is the only signal
// callers (the UI binding layer) ever see; the decrypted plaintext is handed ONLY to the
// jdownloader adapter at connect time via the store's internal DPAPI seam (design.md §4.3/§7).
type JDConfig struct {
	Email            string
	HasPassword      bool
	DeviceName       string
	ExePathOverride  string
	DefaultDestDir   string
	LastSeenStatus   string
	LastSeenAtMs     int64
	LastDecryptError string
}

// ScheduleConfig is the singleton in-process scheduler configuration (download_schedule_config,
// id=1). Mode is reserved for future evolution; only "in_process" is implemented (design §3.5).
// EnabledWeekdays is a 7-bit mask (bit i = time.Weekday(i), bit0=Sunday..bit6=Saturday; all-days
// = 127) restricting which weekdays the scheduler is allowed to fire on (SDD
// download-schedule-weekdays design "Weekday encoding"). A legacy/absent value is read back as
// 127 by the store layer (NULL -> all days enabled), never by this struct's zero value.
type ScheduleConfig struct {
	Mode                    string
	DailyTimeHHMM           string
	Enabled                 bool
	LastRunAtMs             int64
	LastRunStatus           string
	NextRunAtMs             int64
	EnabledWeekdays         byte
	LastSettledLocalDate    string
	LastSettlementReason    ScheduleSettlementReason
	LastMissedAttemptDate   string
	LastMissedAttemptStatus string
}

// ScheduleSettlementReason records how a selected local date became settled.
type ScheduleSettlementReason string

// Supported schedule settlement reasons.
const (
	ScheduleSettlementScheduled ScheduleSettlementReason = "scheduled"
	ScheduleSettlementRunNow    ScheduleSettlementReason = "run_now"
	ScheduleSettlementIgnored   ScheduleSettlementReason = "ignored"
)

// ScheduleSettlementOutcome classifies the monotonic settlement transaction result.
type ScheduleSettlementOutcome string

// Supported settlement outcomes.
const (
	ScheduleSettlementApplied    ScheduleSettlementOutcome = "applied"
	ScheduleSettlementIdempotent ScheduleSettlementOutcome = "idempotent"
	ScheduleSettlementObsolete   ScheduleSettlementOutcome = "obsolete"
)

// ScheduleSettlementRequest is the atomic write used by Ignore and successful Run now.
type ScheduleSettlementRequest struct {
	LocalDate         string
	Reason            ScheduleSettlementReason
	NextRunAtMs       int64
	SuccessfulRunAtMs *int64
	SuccessfulStatus  string
}

// ScheduleSettlementResult reports whether a settlement write advanced the ledger.
type ScheduleSettlementResult struct {
	Outcome ScheduleSettlementOutcome
}

// ManualLink is the typed shape persisted to download_runs.manual_links_json when a run
// degrades to jd_offline (design.md §8 "Manual-links persistence for JD-offline"). It mirrors
// the contracts.ManualLink shape the design names for Phase 6 wiring (`{anime, episode,
// links[]}`) so backend persistence and the eventual UI run-detail view agree on shape;
// defined here (not in `contracts`) because Phase 6 (App bindings) has not landed yet -- the
// Phase 6 batch maps this 1:1 onto contracts.ManualLink at the App boundary.
type ManualLink struct {
	Anime   string   `json:"anime"`
	Episode int      `json:"episode"`
	Links   []string `json:"links"`
}

// Run is a single download_runs row (design.md §4/§8 run lifecycle and status taxonomy). Status
// is the concrete provisional string "running" until FinalizeRun sets a terminal value (one of
// ok|partial|error|jd_offline|no_animes_today|interrupted).
type Run struct {
	RunID              string
	StartedAtMs        int64
	FinishedAtMs       *int64 // nil while non-terminal (design §8 "running" row contract)
	Trigger            string // "scheduled" | "manual"
	AnimesChecked      int
	EpisodesFound      int
	EpisodesDownloaded int
	EpisodesFailed     int
	SkippedCount       int
	// UpToDateCount is the subset of AnimesChecked that was evaluated but needed no
	// download -- either nothing newer than on-disk was online, or the season was already
	// complete on disk. Distinct from SkippedCount (misconfigured/out-of-scope animes that
	// were never evaluated); an up-to-date anime IS counted in AnimesChecked.
	UpToDateCount int
	JDAvailable   bool
	Status        string
	ErrorSummary  string
	ManualLinks   []ManualLink
}

// Store is the persistence port for all four download_* tables (design.md §3.6). sqlite_store.go
// is the production adapter; tests in this package and service tests (a later phase) use an
// in-memory fake satisfying this same interface.
type Store interface {
	// Hoster priority (download_hoster_priority).
	ListHosterPriority(ctx context.Context, site string) ([]HosterPriorityEntry, error)
	SetHosterPriority(ctx context.Context, site string, entries []HosterPriorityEntry) error
	// SeedHosterPriorityIfEmpty seeds entries for site only if no rows exist yet for that site
	// -- it MUST NOT overwrite a user-configured ordering (download-config spec "First run
	// seeds defaults").
	SeedHosterPriorityIfEmpty(ctx context.Context, site string, entries []HosterPriorityEntry) error

	// JD config (download_jd_config, singleton id=1). plaintextPassword nil on SetJDConfig
	// leaves the existing encrypted blob untouched (design §4.3 "edit email/device without
	// re-entering password").
	GetJDConfig(ctx context.Context) (JDConfig, error)
	SetJDConfig(ctx context.Context, cfg JDConfig, plaintextPassword *string) error
	SetJDStatus(ctx context.Context, status string, atMs int64) error
	// DecryptedPassword returns the plaintext MyJD password for the JD adapter to use at
	// connect time ONLY. It is never exposed through JDConfig/GetJDConfig. ok=false when no
	// password is stored; err is non-nil (and the password is always "") when a stored blob
	// exists but fails to decrypt -- the caller is responsible for recording the failure via
	// SetJDConfig's last_decrypt_error sink (design §4.3/§7 C4 sink).
	DecryptedPassword(ctx context.Context) (password string, ok bool, err error)

	// Schedule config (download_schedule_config, singleton id=1).
	GetScheduleConfig(ctx context.Context) (ScheduleConfig, error)
	SetScheduleConfig(ctx context.Context, cfg ScheduleConfig) error
	MarkScheduleRun(ctx context.Context, lastAtMs int64, status string, nextAtMs int64) error
	ApplyScheduleSettlement(ctx context.Context, req ScheduleSettlementRequest) (ScheduleSettlementResult, error)
	RecordMissedStartupAttempt(ctx context.Context, localDate string, status string) error

	// Runs (download_runs).
	// OpenRun writes the row at run start with the CONCRETE provisional status "running" and
	// finished_at_ms = NULL (design §8).
	OpenRun(ctx context.Context, run Run) error
	// FinalizeRun writes the terminal row AND prunes download_runs to the most-recent
	// RUN_RETENTION_LIMIT (200) rows in the SAME transaction (design §4.5/§8, ADR-RETENTION).
	// UpdateRunProgress refreshes counters for the still-running row so UI details can show live
	// progress before FinalizeRun writes the terminal status.
	UpdateRunProgress(ctx context.Context, run Run) error
	FinalizeRun(ctx context.Context, run Run) error
	ListRuns(ctx context.Context, limit int) ([]Run, error)
	// ReconcileInterruptedRuns finalizes every non-terminal row (finished_at_ms IS NULL) as
	// status="interrupted" at the given timestamp, BEFORE the scheduler starts (design §8
	// crash-zombie reconciliation). Returns the count of rows reconciled.
	ReconcileInterruptedRuns(ctx context.Context, atMs int64) (int, error)
}
