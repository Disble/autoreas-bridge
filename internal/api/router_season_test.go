package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	apiHandlers "autoreas-bridge/internal/api/handlers"
)

// TestSeasonRoutesServeOnlyTheRatingCommand pins the season surface after season state moved onto
// the anime sync path: the active-season snapshot read is gone, the rating command remains.
func TestSeasonRoutesServeOnlyTheRatingCommand(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		DeviceService: stubDeviceService{},
		RecordSeasonRating: func(context.Context, string, int, int64, string) (apiHandlers.SeasonRatingResult, error) {
			return apiHandlers.SeasonRatingResult{}, nil
		},
	})
	cases := []struct {
		method string
		path   string
		want   int
	}{
		{method: http.MethodGet, path: "/api/seasons/active", want: http.StatusNotFound},
		{method: http.MethodPost, path: "/api/seasons/active/ratings", want: http.StatusUnauthorized},
	}
	for _, tc := range cases {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest(tc.method, tc.path, nil))
		if res.Code != tc.want {
			t.Fatalf("%s %s = %d, want %d", tc.method, tc.path, res.Code, tc.want)
		}
	}
}
