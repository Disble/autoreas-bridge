package desktop

import (
	"embed"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/wailsapp/wails/v2/pkg/assetserver"
	assetserverOptions "github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

// TestDevAssetRetryServesAModuleThroughWailsProxyOnceViteListens runs the retry over the real Wails
// proxy: the module is requested while nothing listens on the dev-server port (the proxy's dial is
// refused, as in the "actively refused" log), the dev server starts listening a moment later, and
// the window still receives the module instead of a 502.
func TestDevAssetRetryServesAModuleThroughWailsProxyOnceViteListens(t *testing.T) {
	t.Parallel()

	reserved, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := reserved.Addr().String()
	_ = reserved.Close()
	devServerURL, _ := url.Parse("http://" + addr + "/")

	middleware := buildAppOptions(devApp(devServerURL.String()), embed.FS{}).AssetServer.Middleware
	proxy := assetserver.NewExternalAssetsHandler(nil, assetserverOptions.Options{Middleware: middleware}, devServerURL)

	served := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/src/main.tsx", nil))
		served <- rec
	}()

	time.Sleep(400 * time.Millisecond)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatalf("reopen dev-server port: %v", err)
	}
	vite := &http.Server{Handler: http.HandlerFunc(func(rw http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(rw, "export default 1")
	}), ReadHeaderTimeout: time.Second}
	go func() { _ = vite.Serve(listener) }()
	defer func() { _ = vite.Close() }()

	select {
	case rec := <-served:
		if rec.Code != http.StatusOK || rec.Body.String() != "export default 1" {
			t.Fatalf("expected the module once the dev server listens, got status=%d body=%q", rec.Code, rec.Body.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the request never completed")
	}
}
