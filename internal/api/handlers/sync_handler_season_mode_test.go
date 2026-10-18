package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSyncHandlerReportsSeasonModeOnEveryAcceptedReconcile(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		seasonMode func(context.Context) bool
		want       string
	}{
		{name: "season open", seasonMode: func(context.Context) bool { return true }, want: `"season_mode":true`},
		{name: "no season open", seasonMode: func(context.Context) bool { return false }, want: `"season_mode":false`},
		{name: "season reader unavailable", seasonMode: nil, want: `"season_mode":false`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler := NewSyncHandler(SyncHandlerConfig{
				Authenticate:       (&syncHandlerStubs{}).authenticate(true),
				TriggerReconcile:   func(context.Context) error { return nil },
				ListChangesAfterID: func(context.Context, int64) ([]AnimeChange, int64, error) { return nil, 0, nil },
				SeasonMode:         tc.seasonMode,
			})
			res := httptest.NewRecorder()

			handler.ServeHTTP(res, httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[]}`)))

			if res.Code != http.StatusAccepted || !strings.Contains(res.Body.String(), tc.want) {
				t.Fatalf("status %d body %s, want 202 containing %s", res.Code, res.Body.String(), tc.want)
			}
		})
	}
}
