package desktop

import (
	"context"
	"embed"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// devApp returns an App whose environment says it runs under `wails dev` against the given URL.
func devApp(frontendDevServerURL string) *App {
	app := NewApp()
	app.getenvFn = func(key string) string {
		if key == frontendDevServerURLEnv {
			return frontendDevServerURL
		}
		return ""
	}
	return app
}

// flakyHandler answers 502 -- what Wails' Vite proxy writes when it cannot reach the dev server --
// for its first failures calls, then serves "ok". It counts every call in *calls.
func flakyHandler(failures int, calls *int) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, _ *http.Request) {
		*calls++
		if *calls <= failures {
			rw.WriteHeader(http.StatusBadGateway)
			return
		}
		rw.Header().Set("Content-Type", "text/javascript")
		_, _ = rw.Write([]byte("ok"))
	})
}

// TestDevAssetServerRetriesAnUnreachableViteUntilItAnswers pins the fix for the dev window that
// never loads: while the Vite dev server refuses connections, Wails' proxy answers 502 and the
// window keeps a broken module graph for good. Under `wails dev` the asset server retries the
// request until Vite answers, so the window receives the module instead of the 502.
func TestDevAssetServerRetriesAnUnreachableViteUntilItAnswers(t *testing.T) {
	t.Parallel()

	middleware := buildAppOptions(devApp("http://localhost:5173/"), embed.FS{}).AssetServer.Middleware
	if middleware == nil {
		t.Fatal("expected wails dev to install the asset retry middleware")
	}
	calls := 0
	rec := httptest.NewRecorder()
	middleware(flakyHandler(2, &calls)).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/src/main.tsx", nil))

	if rec.Code != http.StatusOK || rec.Body.String() != "ok" || rec.Header().Get("Content-Type") != "text/javascript" || calls != 3 {
		t.Fatalf("expected the third attempt's module after two 502s, got status=%d body=%q type=%q calls=%d",
			rec.Code, rec.Body.String(), rec.Header().Get("Content-Type"), calls)
	}
}

// TestProductionAssetServerInstallsNoRetry keeps the production build untouched: its assets are
// embedded, never proxied, so there is nothing to retry.
func TestProductionAssetServerInstallsNoRetry(t *testing.T) {
	t.Parallel()

	if middleware := buildAppOptions(devApp(""), embed.FS{}).AssetServer.Middleware; middleware != nil {
		t.Fatal("expected no asset middleware outside wails dev")
	}
}

// TestDevAssetRetryPassesThroughWhatItMustNotRetry bounds the retry: it gives up after the last
// attempt or once the request is canceled, never retries what the proxy does not serve or what must
// stream, and does not delay a module that is already served.
func TestDevAssetRetryPassesThroughWhatItMustNotRetry(t *testing.T) {
	t.Parallel()

	upgrade := httptest.NewRequest(http.MethodGet, "/", nil)
	upgrade.Header.Set("Connection", "Upgrade")
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	canceled := httptest.NewRequest(http.MethodGet, "/x.js", nil).WithContext(canceledCtx)
	tests := []struct {
		name      string
		request   *http.Request
		failures  int
		wantCode  int
		wantCalls int
	}{
		{"a server that never answers, after the last attempt", httptest.NewRequest(http.MethodGet, "/x.js", nil), 99, http.StatusBadGateway, 3},
		{"a non-GET request, which the proxy never serves", httptest.NewRequest(http.MethodPost, "/x", nil), 99, http.StatusBadGateway, 1},
		{"a websocket upgrade (Vite's HMR), which must stream", upgrade, 99, http.StatusBadGateway, 1},
		{"a canceled request, without waiting to retry", canceled, 99, http.StatusBadGateway, 1},
		{"a served module, at once", httptest.NewRequest(http.MethodGet, "/x.js", nil), 0, http.StatusOK, 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			calls := 0
			rec := httptest.NewRecorder()
			retryUnreachableDevAssets(3, time.Millisecond)(flakyHandler(tc.failures, &calls)).ServeHTTP(rec, tc.request)
			if rec.Code != tc.wantCode || calls != tc.wantCalls {
				t.Fatalf("expected status=%d calls=%d, got status=%d calls=%d", tc.wantCode, tc.wantCalls, rec.Code, calls)
			}
		})
	}
}
