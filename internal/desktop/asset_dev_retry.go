package desktop

import (
	"bytes"
	"net/http"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

// frontendDevServerURLEnv is the variable `wails dev` sets on the app process to the Vite dev
// server it proxies the window's assets to. It is empty in a production build.
const frontendDevServerURLEnv = "frontenddevserverurl"

// devAssetRetryAttempts and devAssetRetryDelay bound how long one window request waits for an
// unreachable Vite dev server: 40 attempts 250 ms apart, about ten seconds.
const (
	devAssetRetryAttempts = 40
	devAssetRetryDelay    = 250 * time.Millisecond
)

// assetServerMiddleware returns the asset-server middleware for this process: under `wails dev`,
// the retry of an unreachable Vite dev server; in a production build, none, since the assets are
// embedded and never proxied.
func assetServerMiddleware(getenv func(string) string) assetserver.Middleware {
	if getenv(frontendDevServerURLEnv) == "" {
		return nil
	}
	return retryUnreachableDevAssets(devAssetRetryAttempts, devAssetRetryDelay)
}

// retryUnreachableDevAssets retries a window GET while Wails' proxy to the Vite dev server answers
// 502 Bad Gateway, which it writes when it cannot connect ("Proxy error: dial tcp [::1]:5173 ...
// actively refused"). Without it, a module requested while Vite briefly refuses connections
// fails for good and the window keeps a broken page until it is reloaded by hand. Each attempt's
// response is buffered and only the last one reaches the window. A protocol upgrade (Vite's HMR
// websocket) streams, so it passes straight through, as does any non-GET request.
func retryUnreachableDevAssets(attempts int, delay time.Duration) assetserver.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet || isUpgradeRequest(r) {
				next.ServeHTTP(rw, r)
				return
			}
			for attempt := 1; ; attempt++ {
				response := newBufferedResponse()
				next.ServeHTTP(response, r)
				if response.status != http.StatusBadGateway || attempt == attempts || !waitToRetry(r, delay) {
					response.copyTo(rw)
					return
				}
			}
		})
	}
}

// waitToRetry sleeps for delay, reporting false when the request was canceled first.
func waitToRetry(r *http.Request, delay time.Duration) bool {
	select {
	case <-time.After(delay):
		return true
	case <-r.Context().Done():
		return false
	}
}

// isUpgradeRequest reports whether r asks to switch protocols, as a websocket handshake does.
func isUpgradeRequest(r *http.Request) bool {
	return strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade")
}

// bufferedResponse holds one attempt's response until the retry loop decides to keep it.
type bufferedResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

// newBufferedResponse returns an empty response that defaults to 200, as http.ResponseWriter does.
func newBufferedResponse() *bufferedResponse {
	return &bufferedResponse{header: http.Header{}, status: http.StatusOK}
}

// Header returns the buffered response headers.
func (b *bufferedResponse) Header() http.Header { return b.header }

// Write buffers body bytes.
func (b *bufferedResponse) Write(p []byte) (int, error) { return b.body.Write(p) }

// WriteHeader records the status code.
func (b *bufferedResponse) WriteHeader(status int) { b.status = status }

// Flush is a no-op: the whole response is written at once by copyTo.
func (b *bufferedResponse) Flush() {}

// copyTo writes the buffered headers, status and body to rw.
func (b *bufferedResponse) copyTo(rw http.ResponseWriter) {
	for key, values := range b.header {
		rw.Header()[key] = values
	}
	rw.WriteHeader(b.status)
	_, _ = rw.Write(b.body.Bytes())
}
