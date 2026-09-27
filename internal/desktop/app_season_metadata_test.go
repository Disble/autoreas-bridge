package desktop

import (
	"context"
	"path/filepath"
	"slices"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/season"
)

// ── season metadata → created anime ─────────────────────────────────────────

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
	if got.Cover == nil || got.Cover.Type != "url" || got.Cover.Path != metadata.Cover.Path {
		t.Fatalf("cover = %#v, want the confirmed typed cover forwarded as-is", got.Cover)
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

// A cover is only written when the metadata actually carries one WITH a path:
// neither an absent cover nor a typed cover holding an empty path may become a
// stored cover (the first would panic on a nil dereference, the second would
// store a cover pointing nowhere).
func TestSeasonAnimeGatewayLeavesAnUnconfirmedCoverUnset(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		cover *season.AnimeCreateCover
	}{
		{name: "no cover was confirmed at all"},
		{name: "the confirmed cover carries no path", cover: &season.AnimeCreateCover{Type: "url", Path: ""}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			creator := &fakeSeasonAnimeCreator{}
			gateway := seasonAnimeGateway{creator: creator, records: fakeReadRecordLister{}}
			seasonDefault := 0

			if _, err := gateway.CreateAnime(context.Background(), season.AnimeCreateInput{
				Nombre: "Frieren", Pagina: "https://jkanime.net/frieren/", Section: "Sin ver", Tipo: &seasonDefault,
				Metadata: &season.AnimeCreateMetadata{Cover: tc.cover},
			}); err != nil {
				t.Fatalf("CreateAnime: %v", err)
			}

			if got := creator.lastCreate; got.Cover != nil {
				t.Fatalf("an unconfirmed cover must stay unset, got %#v", got.Cover)
			}
		})
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
		"sa-unknown": {Origin: "must be ignored"},
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
	if record.Cover.Type != "url" || record.Cover.Path != confirmed.Cover.Path {
		t.Fatalf("cover = %#v, want the confirmed cover", record.Cover)
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
		t.Fatalf("kind = %v, want the season default 0 (Anime (TV))", record.Kind)
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

// TestSeasonCreateMetadataJSONTagsAreCanonicalSubset is the machine check that
// internal/season cannot own: the season context must not import internal/anime,
// so this composition-root test builds a canonical anime through the real create
// path with every optional field set and asserts each season metadata json name
// is one of the keys it produced. A rename on either side fails here instead of
// silently dropping a confirmed field from the created anime.
//
// A subset alone would also accept a metadata field that must NEVER travel — a
// title, an id, watched progress, the estado, a date — because those ARE canonical
// keys, so the forbidden set is asserted explicitly. Without it, re-adding a
// `name` member would pass this test and only the frontend's exact-tag list would
// catch it.
func TestSeasonCreateMetadataJSONTagsAreCanonicalSubset(t *testing.T) {
	t.Parallel()
	canonicalKeys := canonicalAnimeCreateJSONKeys(t)
	forbidden := []string{"id", "name", "episodesWatched", "status", "active", "createdAt", "days", "sourceUrl", "folder", "premieredAt", "lastWatchedAt", "deletedAt"}
	for _, tag := range seasonAnimeMetadataJSONTags(t) {
		if _, ok := canonicalKeys[tag]; !ok {
			t.Errorf("season metadata json name %q is not a canonical anime create key (%v)", tag, canonicalKeys)
		}
		if slices.Contains(forbidden, tag) {
			t.Errorf("season metadata must never carry %q: it is identity, ownership or lifecycle, not confirmed metadata", tag)
		}
	}
}
