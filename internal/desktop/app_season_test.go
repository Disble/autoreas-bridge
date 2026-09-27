package desktop

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	animeDomain "autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/season"
	seasonDomain "autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

// ── nil service safety ──────────────────────────────────────────────────────

func TestGetSeasonReturnsNilWhenServiceNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if app.GetSeason() != nil {
		t.Fatal("expected nil season when service is nil")
	}
}

func TestSeasonMutatorsReturnErrorStringWhenServiceNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	for name, got := range map[string]string{
		"CreateSeason":              app.CreateSeason("Julio 2026"),
		"SetSeasonMinApprovalGrade": app.SetSeasonMinApprovalGrade(4),
		"SetSeasonSlots":            app.SetSeasonSlots(12),
		"CloseSeason":               app.CloseSeason(),
	} {
		if got == "" || got == "ok" {
			t.Fatalf("%s: expected non-ok error string with nil service, got %q", name, got)
		}
	}
}

// ── wired round-trip ────────────────────────────────────────────────────────

func TestCreateSeasonRoundTripAndBroadcast(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{seasonChanges: make(chan string, 1)}
	app := newTestSeasonApp(newFakeSeasonRepo(), hub)

	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: expected ok, got %q", got)
	}

	dto := app.GetSeason()
	if dto == nil {
		t.Fatal("expected an active season after create")
	}
	if dto.Name != "Julio 2026" || dto.Status != "open" || dto.Slots != 12 || dto.MinApprovalGrade != 4 {
		t.Fatalf("unexpected DTO: %+v", dto)
	}
	if dto.ClosedAt != nil || dto.AppliedAt != nil {
		t.Fatalf("milestones must be null: %+v", dto)
	}

	select {
	case status := <-hub.seasonChanges:
		if status != "open" {
			t.Fatalf("expected broadcast status open, got %q", status)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected a season_changed broadcast")
	}
}

func TestCreateSeasonRejectsSecondOpen(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("first create: %q", got)
	}
	if got := app.CreateSeason("Octubre 2026"); got == "ok" || got == "" {
		t.Fatalf("expected error string on second open season, got %q", got)
	}
}

func TestSetSeasonParametersRoundTrip(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.SetSeasonMinApprovalGrade(5); got != "ok" {
		t.Fatalf("SetSeasonMinApprovalGrade: %q", got)
	}
	if got := app.SetSeasonSlots(9); got != "ok" {
		t.Fatalf("SetSeasonSlots: %q", got)
	}
	dto := app.GetSeason()
	if dto.MinApprovalGrade != 5 || dto.Slots != 9 {
		t.Fatalf("params not persisted: %+v", dto)
	}

	if got := app.SetSeasonMinApprovalGrade(9); got == "ok" || got == "" {
		t.Fatalf("expected rejection of out-of-range grade, got %q", got)
	}
}

func TestImportSeasonIntakeAndGetSeasonAnimes(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.ImportSeasonIntake("Dr. Stone\nMARRIAGETOXIN\ndr. stone"); got != "ok" {
		t.Fatalf("ImportSeasonIntake: %q", got)
	}
	rows := app.GetSeasonAnimes()
	if len(rows) != 2 {
		t.Fatalf("expected 2 deduped rows, got %d: %+v", len(rows), rows)
	}
	for _, r := range rows {
		if r.MatchStatus != "pending" {
			t.Fatalf("expected pending, got %q", r.MatchStatus)
		}
	}
}

func TestImportSeasonIntakeWithoutActiveSeason(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	if got := app.ImportSeasonIntake("Dr. Stone"); got == "ok" || got == "" {
		t.Fatalf("expected error without an active season, got %q", got)
	}
}

func TestRunSeasonMatchingRefreshesAvailabilityForNewMatches(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	fixed := time.UnixMilli(1_700_000_000_000)
	n := 0
	svc := season.NewService(repo, func() time.Time { return fixed }, func() string {
		n++
		return fmt.Sprintf("id-%d", n)
	}, fakeAppNameSearcher{byQuery: map[string][]match.Candidate{
		"Anime With Episode": {
			{Title: "Anime With Episode", PageURL: "https://jkanime.net/anime-with-episode/"},
		},
	}})
	svc.SetAvailabilityDeps(fakeAppAvailabilityProbe{episodes: map[string]int{
		"https://jkanime.net/anime-with-episode/": 1,
	}}, nil)
	app := &App{ctx: context.Background(), seasonService: svc}

	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	if got := app.ImportSeasonIntake("Anime With Episode"); got != "ok" {
		t.Fatalf("ImportSeasonIntake: %q", got)
	}

	if got := app.RunSeasonMatching(); got != "ok" {
		t.Fatalf("RunSeasonMatching: %q", got)
	}

	rows := app.GetSeasonAnimes()
	if len(rows) != 1 {
		t.Fatalf("expected one row, got %+v", rows)
	}
	if rows[0].MatchStatus != "matched" || rows[0].Availability != "available" || rows[0].AvailableEpisodes != 1 {
		t.Fatalf("matching must immediately expose creatable rows, got %+v", rows[0])
	}
}

func TestResolveAndDiscardSeasonRows(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")
	_ = app.ImportSeasonIntake("Anime Uno\nAnime Dos")
	rows := app.GetSeasonAnimes()
	if len(rows) != 2 {
		t.Fatalf("setup expected 2 rows, got %d", len(rows))
	}

	if got := app.ResolveSeasonMatch(rows[0].ID, "https://jkanime.net/anime-uno/"); got != "ok" {
		t.Fatalf("ResolveSeasonMatch: %q", got)
	}
	if got := app.DiscardSeasonName(rows[1].ID); got != "ok" {
		t.Fatalf("DiscardSeasonName: %q", got)
	}

	after := app.GetSeasonAnimes()
	status := map[string]string{}
	for _, r := range after {
		status[r.ID] = r.MatchStatus
	}
	if status[rows[0].ID] != "matched" || status[rows[1].ID] != "discarded" {
		t.Fatalf("unexpected statuses: %+v", status)
	}
}

func TestReconcileSeasonIntakeAddsAndDiscards(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.ReconcileSeasonIntake("Anime A\nAnime B\nAnime C"); got != "ok" {
		t.Fatalf("ReconcileSeasonIntake: %q", got)
	}
	if len(app.GetSeasonAnimes()) != 3 {
		t.Fatalf("expected 3 rows after reconcile")
	}

	if got := app.ReconcileSeasonIntake("Anime A"); got != "ok" {
		t.Fatalf("second reconcile: %q", got)
	}
	active := app.GetSeasonAnimes()
	pending := 0
	for _, r := range active {
		if r.MatchStatus == "pending" {
			pending++
		}
	}
	if pending != 1 {
		t.Fatalf("expected 1 pending row after narrowing, got %d (%+v)", pending, active)
	}
}

func TestSendSeasonAnimesToVerHoy(t *testing.T) {
	t.Parallel()
	episode := &appliedDaysEpisodeService{stubAppEpisodeService: &stubAppEpisodeService{}}
	app := &App{ctx: context.Background(), episodeService: episode}

	got := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
	if got.Status != "ok" {
		t.Fatalf("SendSeasonAnimesToVerHoy: %q", got.Status)
	}
	if episode.lastDays.AnimeID != "anime-1" || len(episode.lastDays.Dias) != 1 || episode.lastDays.Dias[0] != "Ver hoy" {
		t.Fatalf("expected a Ver hoy move for anime-1, got %+v", episode.lastDays)
	}
	// No download store configured -> the window is treated as passed (offer manual).
	if !got.PastDownloadTime {
		t.Fatalf("expected PastDownloadTime=true without a download schedule, got %+v", got)
	}
}

func TestSendSeasonAnimesToVerHoyBeforeWindowIsAutomatic(t *testing.T) {
	t.Parallel()
	episode := &appliedDaysEpisodeService{stubAppEpisodeService: &stubAppEpisodeService{}}
	fixedNow := time.Date(2026, 7, 8, 10, 0, 0, 0, time.Local)
	future := fixedNow.Add(2 * time.Hour).Format("15:04")
	store := &fakeAppDownloadStore{scheduleConfig: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: future}}
	sched := &fakeAppScheduler{}
	app := &App{ctx: context.Background(), episodeService: episode, downloadStore: store, downloadScheduler: sched, nowTime: func() time.Time { return fixedNow }}

	got := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
	if got.Status != "ok" || got.PastDownloadTime {
		t.Fatalf("before the window the send is automatic (no manual prompt), got %+v", got)
	}
	if got.DownloadTime != future {
		t.Fatalf("expected DownloadTime %q, got %q", future, got.DownloadTime)
	}
	if sched.triggerNowCalls != 0 {
		t.Fatalf("send must not force a download run; the schedule handles it, got %d triggers", sched.triggerNowCalls)
	}
}

func TestSendSeasonAnimesToVerHoyPastWindowOffersManual(t *testing.T) {
	t.Parallel()
	episode := &appliedDaysEpisodeService{stubAppEpisodeService: &stubAppEpisodeService{}}
	fixedNow := time.Date(2026, 7, 8, 10, 0, 0, 0, time.Local)
	past := fixedNow.Add(-2 * time.Hour).Format("15:04")
	store := &fakeAppDownloadStore{scheduleConfig: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: past}}
	app := &App{ctx: context.Background(), episodeService: episode, downloadStore: store, nowTime: func() time.Time { return fixedNow }}

	got := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
	if got.Status != "ok" || !got.PastDownloadTime {
		t.Fatalf("past the window the send must flag a manual download, got %+v", got)
	}
}

func TestSendSeasonAnimesToVerHoyNoEpisodeService(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if got := app.SendSeasonAnimesToVerHoy([]string{"anime-1"}); got.Status == "ok" || got.Status == "" {
		t.Fatalf("expected error without episode service, got %q", got.Status)
	}
}

func TestTriggerSeasonDownloads(t *testing.T) {
	t.Parallel()
	sched := &fakeAppScheduler{}
	app := &App{ctx: context.Background(), downloadScheduler: sched}
	if got := app.TriggerSeasonDownloads(); got != "ok" {
		t.Fatalf("TriggerSeasonDownloads: %q", got)
	}
	if sched.triggerNowCalls != 1 {
		t.Fatalf("expected one manual download trigger, got %d", sched.triggerNowCalls)
	}
}

func TestSeasonAnimeDTOsOverlaysFolderAndPageForCreatedRowsOnly(t *testing.T) {
	t.Parallel()
	folder := "D:/downloads/frieren"
	page := "https://jkanime.net/frieren/"
	app := &App{ctx: context.Background(), animeQuery: &stubAnimeReadQuery{records: []anime.ReadRecord{
		{Value: animeDomain.Anime{ID: "anime-1", Days: []animeDomain.AnimeDay{{Day: "Sin ver", Order: 1}}, Folder: &folder, SourceURL: &page}},
	}}}
	rows := []seasonDomain.SeasonAnime{
		{ID: "row-created", RawName: "Frieren", AnimeID: "anime-1"},
		{ID: "row-pending", RawName: "Pending Anime", AnimeID: ""},
	}

	dtos := app.seasonAnimeDTOs(context.Background(), rows)
	if len(dtos) != 2 {
		t.Fatalf("expected 2 DTOs, got %d", len(dtos))
	}
	created, pending := dtos[0], dtos[1]
	if created.FolderPath != folder || created.PageURL != page || created.Section != "Sin ver" {
		t.Fatalf("created row = %+v, want folderPath=%q pageUrl=%q section=Sin ver", created, folder, page)
	}
	if pending.FolderPath != "" || pending.PageURL != "" || pending.Section != "" {
		t.Fatalf("uncreated row must have empty folder/page/section, got %+v", pending)
	}
}

func TestGetSeasonAnimesEmptyWhenNoService(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if got := app.GetSeasonAnimes(); len(got) != 0 {
		t.Fatalf("expected empty list with nil service, got %+v", got)
	}
}

func TestCloseSeasonClearsActiveAndBroadcastsClosed(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{seasonChanges: make(chan string, 2)}
	app := newTestSeasonApp(newFakeSeasonRepo(), hub)
	_ = app.CreateSeason("Julio 2026")
	<-hub.seasonChanges // drain the create broadcast

	if got := app.CloseSeason(); got != "ok" {
		t.Fatalf("CloseSeason: %q", got)
	}
	if app.GetSeason() != nil {
		t.Fatal("expected no active season after close")
	}
	select {
	case status := <-hub.seasonChanges:
		if status != "closed" {
			t.Fatalf("expected broadcast status closed, got %q", status)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected a season_changed broadcast on close")
	}
}

// ── confirmed MyAnimeList metadata at creation ──────────────────────────────

// The gateway maps ONLY the allow-listed metadata fields onto the anime create
// contract. The confirmed title is deliberately dropped in favor of the row's raw
// name, and progress/id are never authored.
func TestSeasonAnimeGatewayMapsOnlyAllowListedMetadataFields(t *testing.T) {
	t.Parallel()
	creator := &fakeSeasonAnimeCreator{result: anime.PatchResult{AnimeID: "created-anime", Outcome: anime.PatchOutcomeApplied}}
	gateway := seasonAnimeGateway{creator: creator, records: fakeReadRecordLister{}}

	metadata := confirmedSeasonMetadata()
	seasonDefault := 0
	if _, err := gateway.CreateAnime(context.Background(), season.AnimeCreateInput{
		Nombre: "Frieren", Pagina: "https://jkanime.net/frieren/", Section: "Sin ver",
		Carpeta: "D:/Anime/Frieren", Tipo: &seasonDefault, Metadata: &metadata,
	}); err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}

	got := creator.lastCreate
	if got.Nombre != "Frieren" {
		t.Fatalf("name = %q, want the row's raw name over the confirmed title", got.Nombre)
	}
	if got.Tipo == nil || *got.Tipo != 2 || got.TotalEpisodes == nil || *got.TotalEpisodes != 24 || got.DurationMinutes == nil || *got.DurationMinutes != 45 {
		t.Fatalf("kind/totalEpisodes/durationMinutes not mapped: %#v", got)
	}
	if got.Origin != "Manga" || len(got.Genres) != 2 || len(got.Studios) != 1 {
		t.Fatalf("origin/genres/studios not mapped: %#v", got)
	}
	if got.Cover == nil || got.Cover.Type != "url" || got.Cover.Path != metadata.CoverURL {
		t.Fatalf("cover = %#v, want the confirmed cover URL typed url", got.Cover)
	}
	if got.ID != "" || got.EpisodesWatched != nil {
		t.Fatalf("a season create must never author an id or watched progress: %#v", got)
	}
}

// A lookup that confirmed only one genre or one studio must still forward it:
// the guard is "is there anything to send", not "is there more than one".
func TestSeasonAnimeGatewayForwardsASingleConfirmedGenreAndStudio(t *testing.T) {
	t.Parallel()
	creator := &fakeSeasonAnimeCreator{result: anime.PatchResult{AnimeID: "created-anime", Outcome: anime.PatchOutcomeApplied}}
	gateway := seasonAnimeGateway{creator: creator, records: fakeReadRecordLister{}}

	seasonDefault := 0
	metadata := confirmedSeasonMetadata()
	metadata.Genres = []string{"Fantasy"}
	metadata.Studios = []string{"Madhouse"}
	if _, err := gateway.CreateAnime(context.Background(), season.AnimeCreateInput{
		Nombre: "Frieren", Pagina: "https://jkanime.net/frieren/", Section: "Sin ver",
		Carpeta: "D:/Anime/Frieren", Tipo: &seasonDefault, Metadata: &metadata,
	}); err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}

	got := creator.lastCreate
	if len(got.Genres) != 1 || got.Genres[0] != "Fantasy" || len(got.Studios) != 1 || got.Studios[0] != "Madhouse" {
		t.Fatalf("a single confirmed genre/studio must be forwarded: %#v", got)
	}
}

// Without metadata the gateway sends exactly the create it sent before metadata
// existed: every optional field stays unset and the caller's tipo passes through.
func TestSeasonAnimeGatewayWithoutMetadataSetsNoOptionalField(t *testing.T) {
	t.Parallel()
	creator := &fakeSeasonAnimeCreator{}
	gateway := seasonAnimeGateway{creator: creator, records: fakeReadRecordLister{}}

	seasonDefault := 0
	if _, err := gateway.CreateAnime(context.Background(), season.AnimeCreateInput{
		Nombre: "Frieren", Pagina: "https://jkanime.net/frieren/", Section: "Sin ver", Tipo: &seasonDefault,
	}); err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}

	got := creator.lastCreate
	if got.Tipo == nil || *got.Tipo != 0 || got.TotalEpisodes != nil || got.DurationMinutes != nil {
		t.Fatalf("tipo must pass through and optional numbers stay unset: %#v", got)
	}
	if got.Origin != "" || got.Genres != nil || got.Studios != nil || got.Cover != nil {
		t.Fatalf("no optional field may be set without metadata: %#v", got)
	}
}

// A metadata entry that confirmed nothing must leave every create field exactly
// as it was: the season default tipo survives, and an empty cover URL or empty
// list never becomes a set field.
func TestSeasonAnimeGatewayPartialMetadataLeavesUnconfirmedFieldsUnset(t *testing.T) {
	t.Parallel()
	creator := &fakeSeasonAnimeCreator{}
	gateway := seasonAnimeGateway{creator: creator, records: fakeReadRecordLister{}}

	metadata := season.AnimeCreateMetadata{Genres: []string{}, Studios: []string{}}
	seasonDefault := 0
	if _, err := gateway.CreateAnime(context.Background(), season.AnimeCreateInput{
		Nombre: "Frieren", Pagina: "https://jkanime.net/frieren/", Section: "Sin ver", Tipo: &seasonDefault, Metadata: &metadata,
	}); err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}

	got := creator.lastCreate
	if got.Tipo == nil || *got.Tipo != 0 {
		t.Fatalf("tipo = %#v, want the season default preserved when the lookup confirmed no kind", got.Tipo)
	}
	if got.TotalEpisodes != nil || got.DurationMinutes != nil {
		t.Fatalf("unconfirmed numbers must stay unset: %#v", got)
	}
	if got.Origin != "" || got.Genres != nil || got.Studios != nil || got.Cover != nil {
		t.Fatalf("empty metadata values must never be set: %#v", got)
	}
}

// A create with confirmed metadata writes exactly the allow-listed fields into
// the real SQLite record, while the user's raw name, chosen folder and matched
// page still win and no premiere/first-watch date is ever authored.
func TestCreateSeasonAnimesBindingWritesConfirmedMetadataIntoRealSQLite(t *testing.T) {
	fixture := newRuntimeSeasonFixture(t)
	fixture.seedAvailableRow(t, "sa-a", "Frieren", "https://jkanime.net/frieren/")

	confirmed := confirmedSeasonMetadata()
	folder := filepath.Join("E:", "Anime", "Chosen")
	metadata := map[string]season.AnimeCreateMetadata{
		"sa-a":       confirmed,
		"sa-unknown": {Name: "must be ignored"},
	}
	if got := fixture.app.CreateSeasonAnimes([]string{"sa-a"}, map[string]string{"sa-a": folder}, metadata); got != "ok" {
		t.Fatalf("CreateSeasonAnimes: %q", got)
	}

	record, hasPremiere := readCreatedAnime(t, fixture.store, "created-anime")
	if record.Name != "Frieren" || record.SourceURL != "https://jkanime.net/frieren/" || record.Folder != folder {
		t.Fatalf("user values must win: name=%q sourceUrl=%q folder=%q", record.Name, record.SourceURL, record.Folder)
	}
	numbers := map[string]struct {
		value *int
		want  int
	}{
		"kind":            {record.Kind, 2},
		"totalEpisodes":   {record.TotalEpisodes, 24},
		"durationMinutes": {record.DurationMinutes, 45},
	}
	for name, check := range numbers {
		if check.value == nil || *check.value != check.want {
			t.Fatalf("%s = %v, want %d", name, check.value, check.want)
		}
	}
	if record.Origin != "Manga" || len(record.Genres) != 2 || len(record.Studios) != 1 {
		t.Fatalf("origin/genres/studios not persisted: %#v", record)
	}
	if record.Cover.Type != "url" || record.Cover.Path != confirmed.CoverURL {
		t.Fatalf("cover = %#v, want the confirmed cover URL", record.Cover)
	}
	if record.EpisodesWatched != 0 || hasPremiere {
		t.Fatalf("this path must never author progress or a premiere date: episodesWatched=%d premieredAt=%v", record.EpisodesWatched, hasPremiere)
	}
	if len(record.Days) != 1 || record.Days[0].Day != "Sin ver" || record.Days[0].Order != 1 {
		t.Fatalf("days = %#v, want one Sin ver placement", record.Days)
	}
}

// A create with no confirmed metadata writes exactly the record this path wrote
// before metadata existed: the season default tipo, no confirmed optional fields
// and the pre-existing empty cover.
func TestCreateSeasonAnimesBindingWithoutMetadataWritesUnchangedRecord(t *testing.T) {
	fixture := newRuntimeSeasonFixture(t)
	fixture.seedAvailableRow(t, "sa-a", "Frieren", "https://jkanime.net/frieren/")

	if got := fixture.app.CreateSeasonAnimes([]string{"sa-a"}, nil, nil); got != "ok" {
		t.Fatalf("CreateSeasonAnimes: %q", got)
	}

	record, hasPremiere := readCreatedAnime(t, fixture.store, "created-anime")
	if record.Kind == nil || *record.Kind != 0 {
		t.Fatalf("kind = %v, want the season default 0 (Serie)", record.Kind)
	}
	if record.TotalEpisodes != nil || record.DurationMinutes != nil || record.Origin != "" || record.Genres != nil || record.Studios != nil {
		t.Fatalf("unconfirmed optional fields must stay unset: %#v", record)
	}
	if record.Cover.Type != "url" || record.Cover.Path != "" {
		t.Fatalf("cover = %#v, want the pre-existing empty url cover", record.Cover)
	}
	if record.Name != "Frieren" || record.Folder != "" || record.EpisodesWatched != 0 || hasPremiere {
		t.Fatalf("unchanged record diverged: %#v premieredAt=%v", record, hasPremiere)
	}
}
