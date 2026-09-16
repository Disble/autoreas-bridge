package desktop

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/api/contracts"
)

// coverFetcher serves one canned origin response so the desktop cover tests never touch the network.
type coverFetcher struct {
	data []byte
	err  error
}

// Fetch returns the canned origin response, or its canned failure.
func (f coverFetcher) Fetch(context.Context, string) (cover.FetchResult, error) {
	if f.err != nil {
		return cover.FetchResult{}, f.err
	}
	return cover.FetchResult{Data: f.data, ContentType: "image/jpeg"}, nil
}

// stubCoverThumbnails is a cover double for the states the real service cannot produce: an error
// beside bytes, or no bytes without one.
type stubCoverThumbnails struct {
	result cover.ThumbnailResult
	err    error
}

// GetDesktop returns the canned desktop outcome.
func (s stubCoverThumbnails) GetDesktop(context.Context, string) (cover.ThumbnailResult, error) {
	return s.result, s.err
}

// GetHTTP returns the canned HTTP outcome.
func (s stubCoverThumbnails) GetHTTP(context.Context, string) (cover.ThumbnailResult, error) {
	return s.result, s.err
}

// tallJPEG encodes a source taller than the 320 px thumbnail target, so a served cover is generated.
func tallJPEG(t *testing.T) []byte {
	t.Helper()

	img := image.NewNRGBA(image.Rect(0, 0, 600, 900))
	draw.Draw(img, img.Bounds(), image.NewUniform(color.NRGBA{R: 20, G: 120, B: 200, A: 255}), image.Point{}, draw.Src)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode source jpeg: %v", err)
	}
	return buf.Bytes()
}

// coverService builds the shared ThumbnailService the desktop binding and the HTTP API both use.
func coverService(t *testing.T, fetcher cover.Fetcher) *cover.ThumbnailService {
	t.Helper()

	return cover.NewThumbnailService(cover.NewResolver(nil, fetcher, cover.NewDiskCache(t.TempDir()), 0), t.TempDir())
}

// queryFor returns a lookup stub serving one anime whose cover value is coverPath, or failing with err.
func queryFor(coverPath *string, err error) *stubAnimeQueryService {
	return &stubAnimeQueryService{mobileAnime: &contracts.MobileAnime{ID: "anime-1", Cover: coverPath}, err: err}
}

// placeholderApp builds an App over one lookup stub and the shared cover service; a nil query leaves
// the seam unset rather than holding a typed nil in the interface field.
func placeholderApp(t *testing.T, query *stubAnimeQueryService, fetcher cover.Fetcher) *App {
	t.Helper()

	app := &App{ctx: context.Background(), coverThumbnails: coverService(t, fetcher)}
	if query != nil {
		app.animeQuery = query
	}
	return app
}

// TestGetAnimeCoverReturnsThumbnailJPEGDataURL proves the binding serves the shared service's
// generated thumbnail as a base64 JPEG data URL, never the original source bytes.
func TestGetAnimeCoverReturnsThumbnailJPEGDataURL(t *testing.T) {
	t.Parallel()

	url := "https://cdn.example.com/cover.jpg"
	source := tallJPEG(t)
	got := placeholderApp(t, queryFor(&url, nil), coverFetcher{data: source}).GetAnimeCover("anime-1")

	if got.Source != contracts.CoverSourceCover {
		t.Fatalf("source = %q, want %q", got.Source, contracts.CoverSourceCover)
	}
	const prefix = "data:image/jpeg;base64,"
	if !strings.HasPrefix(got.DataURL, prefix) {
		t.Fatalf("data URL = %q, want the JPEG base64 prefix", got.DataURL)
	}
	served, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(got.DataURL, prefix))
	if err != nil {
		t.Fatalf("decode data URL: %v", err)
	}
	if bytes.Equal(served, source) {
		t.Fatal("served the original source bytes; the binding must serve the thumbnail")
	}
	img, _, err := image.Decode(bytes.NewReader(served))
	if err != nil {
		t.Fatalf("decode served thumbnail: %v", err)
	}
	if img.Bounds().Dy() > 320 {
		t.Fatalf("served thumbnail height = %d, want <= 320", img.Bounds().Dy())
	}
}

// TestGetAnimeCoverPreservesPlaceholderForNilDependencies proves both nil dependencies degrade to
// the placeholder signal instead of an error.
func TestGetAnimeCoverPreservesPlaceholderForNilDependencies(t *testing.T) {
	t.Parallel()

	withService := placeholderApp(t, nil, coverFetcher{data: tallJPEG(t)})
	url := "https://cdn.example.com/cover.jpg"
	withoutService := &App{ctx: context.Background(), animeQuery: queryFor(&url, nil)}

	for name, app := range map[string]*App{"nil anime query": withService, "nil cover service": withoutService} {
		if got := app.GetAnimeCover("anime-1"); got.Source != contracts.CoverSourcePlaceholder || got.DataURL != "" {
			t.Fatalf("%s: got %#v, want the placeholder signal", name, got)
		}
	}
}

// TestGetAnimeCoverGuardsTheLookupAndSeamContract proves every degraded path returns the placeholder
// signal -- a lookup failure, an absent or undecodable cover, an absent lookup that must never reach
// the port, and a seam that violates its own contract by reporting an error beside bytes or no bytes
// at all -- while the smallest servable body is still served.
func TestGetAnimeCoverGuardsTheLookupAndSeamContract(t *testing.T) {
	t.Parallel()

	url := "https://cdn.example.com/cover.jpg"
	empty := ""
	served := cover.ThumbnailResult{Bytes: []byte{0xFF, 0xD8, 0xFF, 0x01}, ETag: `"abc123"`}
	image := func() cover.Fetcher { return coverFetcher{data: tallJPEG(t)} }
	cases := []struct {
		name      string
		query     *stubAnimeQueryService
		seam      coverThumbnails
		fetcher   cover.Fetcher
		wantCover bool
	}{
		{name: "lookup failure", query: queryFor(&url, errors.New("lookup down")), fetcher: image()},
		{name: "empty cover value", query: queryFor(&empty, nil), fetcher: image()},
		{name: "unreachable origin", query: queryFor(&url, nil), fetcher: coverFetcher{err: errors.New("origin down")}},
		{name: "undecodable source", query: queryFor(&url, nil), fetcher: coverFetcher{data: []byte("not an image at all")}},
		{name: "nil lookup never reaches the port", query: &stubAnimeQueryService{}, seam: stubCoverThumbnails{result: served}},
		{name: "error beside bytes", query: queryFor(&url, nil), seam: stubCoverThumbnails{result: served, err: errors.New("failed anyway")}},
		{name: "empty bytes without an error", query: queryFor(&url, nil), seam: stubCoverThumbnails{}},
		{name: "the smallest servable body is served", query: queryFor(&url, nil), seam: stubCoverThumbnails{result: cover.ThumbnailResult{Bytes: []byte{0x01}, ETag: `"one"`}}, wantCover: true},
	}
	for _, tc := range cases {
		seam := tc.seam
		if seam == nil {
			seam = coverService(t, tc.fetcher)
		}
		app := &App{ctx: context.Background(), animeQuery: tc.query, coverThumbnails: seam}
		if got := app.GetAnimeCover("anime-1"); (got.Source == contracts.CoverSourceCover) != tc.wantCover {
			t.Fatalf("%s: source = %q, want a cover: %v", tc.name, got.Source, tc.wantCover)
		}
	}
}

// TestAPICoverThumbnailsServeTheSharedService proves the HTTP adapter reads the same service the
// binding does, mapping a served thumbnail and each failure class onto the transport contract.
func TestAPICoverThumbnailsServeTheSharedService(t *testing.T) {
	t.Parallel()

	url := "https://cdn.example.com/cover.jpg"
	empty := ""
	cases := []struct {
		name       string
		service    *cover.ThumbnailService
		coverPath  string
		wantStatus contracts.CoverThumbnailStatus
	}{
		{name: "served", service: coverService(t, coverFetcher{data: tallJPEG(t)}), coverPath: url, wantStatus: contracts.CoverThumbnailServed},
		{name: "permanent absence", service: coverService(t, coverFetcher{data: tallJPEG(t)}), coverPath: empty, wantStatus: contracts.CoverThumbnailPermanent},
		{name: "transient origin failure", service: coverService(t, coverFetcher{err: errors.New("origin down")}), coverPath: url, wantStatus: contracts.CoverThumbnailTransient},
	}
	for _, tc := range cases {
		thumbnail, status := apiCoverThumbnails{service: tc.service}.GetCoverThumbnail(context.Background(), tc.coverPath)
		if status != tc.wantStatus {
			t.Fatalf("%s: status = %d, want %d", tc.name, status, tc.wantStatus)
		}
		if tc.wantStatus == contracts.CoverThumbnailServed && (thumbnail.ETag == "" || len(thumbnail.Bytes) == 0) {
			t.Fatalf("%s: served thumbnail = %#v, want bytes and a strong ETag", tc.name, thumbnail)
		}
	}
}

// TestConfigureAnimeApplicationServicesWiresTheCoverSeam proves the composition root builds the
// shared cover service from a real cache root: without it the desktop binding could only ever show
// placeholders and the HTTP route could only answer 503.
func TestConfigureAnimeApplicationServicesWiresTheCoverSeam(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background(), bridgeDB: openRuntimeBridgeDB(t)}

	app.configureAnimeApplicationServices()

	if app.coverThumbnails == nil {
		t.Fatal("configureAnimeApplicationServices left the cover seam unwired")
	}
}

// TestToEpisodeScheduleContractsMapsFolderPagePageURLHasCoverAndDropsBooleans guards the episode
// schedule mapping that used to share app_runtime_cover_test.go.
func TestToEpisodeScheduleContractsMapsFolderPagePageURLHasCoverAndDropsBooleans(t *testing.T) {
	t.Parallel()

	items := []anime.EpisodeScheduleItem{{
		AnimeID:    "anime-1",
		AnimeName:  "Frieren",
		FolderPath: `C:\anime\frieren`,
		PageURL:    "https://example.com/watch",
		HasCover:   true,
	}}

	got := toEpisodeScheduleContracts(items)
	if len(got) != 1 {
		t.Fatalf("expected one contract, got %#v", got)
	}
	if got[0].FolderPath != `C:\anime\frieren` {
		t.Fatalf("expected folderPath mapped through, got %#v", got[0])
	}
	if got[0].PageURL != "https://example.com/watch" {
		t.Fatalf("expected pageUrl mapped through, got %#v", got[0])
	}
	if !got[0].HasCover {
		t.Fatalf("expected hasCover mapped through, got %#v", got[0])
	}
}
