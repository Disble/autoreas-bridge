package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

// stubCoverThumbnails records the source the cover port was asked for and serves one canned JPEG thumbnail.
type stubCoverThumbnails struct{ source string }

// GetCoverThumbnail records source and returns one served thumbnail.
func (s *stubCoverThumbnails) GetCoverThumbnail(_ context.Context, source string) (contracts.CoverThumbnail, contracts.CoverThumbnailStatus) {
	s.source = source
	return contracts.CoverThumbnail{Bytes: []byte{0xFF, 0xD8, 0xFF, 0x01}, ETag: `"abc123"`}, contracts.CoverThumbnailServed
}

// TestRouterCoverRouteIsMoreSpecificThanAnimeByID proves the method-less cover row wins route
// precedence (image/jpeg with the anime's cover, where the anime-by-id route answers JSON), that
// HEAD is rejected even with a valid token, and that PATCH never reaches the anime patch handler.
func TestRouterCoverRouteIsMoreSpecificThanAnimeByID(t *testing.T) {
	t.Parallel()

	cover := "https://cdn.example.com/cover.jpg"
	thumbs := &stubCoverThumbnails{}
	handler := NewHandler(Config{
		DeviceService:   stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1"}},
		AnimeQuery:      stubAnimeQueryService{item: &contracts.MobileAnime{ID: "anime-1", Active: 0, Cover: &cover}},
		CoverThumbnails: thumbs,
	})

	cases := []struct {
		method     string
		wantStatus int
	}{
		{method: http.MethodGet, wantStatus: http.StatusOK},
		{method: http.MethodHead, wantStatus: http.StatusMethodNotAllowed},
		{method: http.MethodPatch, wantStatus: http.StatusMethodNotAllowed},
	}
	for _, tc := range cases {
		t.Run(tc.method, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/api/animes/anime-1/cover", nil)
			req.Header.Set("Authorization", "Bearer good-token")
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)

			if res.Code != tc.wantStatus {
				t.Fatalf("%s status = %d, want %d (body %q)", tc.method, res.Code, tc.wantStatus, res.Body.String())
			}
			if tc.wantStatus == http.StatusOK && (res.Header().Get("Content-Type") != "image/jpeg" || thumbs.source != cover) {
				t.Fatalf("Content-Type = %q source = %q, want image/jpeg and %q (the anime-by-id route would answer JSON)", res.Header().Get("Content-Type"), thumbs.source, cover)
			}
		})
	}
}
