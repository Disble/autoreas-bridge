package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

// abandonedRoutes records the routes the abandoned-request hook reports.
type abandonedRoutes struct{ routes []string }

// record is the hook under test.
func (a *abandonedRoutes) record(route string) { a.routes = append(a.routes, route) }

// serveWithContext serves one GET to path through handler with ctx.
func serveWithContext(handler http.Handler, ctx context.Context, path string) {
	request := httptest.NewRequestWithContext(ctx, http.MethodGet, path, nil)
	handler.ServeHTTP(httptest.NewRecorder(), request)
}

// cancelledContext is a request context whose client already gave up.
func cancelledContext() context.Context {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx
}

func TestReportAbandonedRequestsNamesOnlyRequestsWhoseClientGaveUp(t *testing.T) {
	t.Parallel()
	got := &abandonedRoutes{}
	handler := reportAbandonedRequests(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), got.record)

	serveWithContext(handler, context.Background(), "/api/animes")
	serveWithContext(handler, cancelledContext(), "/api/status")
	serveWithContext(handler, cancelledContext(), webSocketRoutePath)

	if want := []string{"/api/status"}; !reflect.DeepEqual(got.routes, want) {
		t.Fatalf("expected only the abandoned non-WebSocket request, got %#v", got.routes)
	}
}

func TestReportAbandonedRequestsReportsAfterTheHandlerReturns(t *testing.T) {
	t.Parallel()
	got := &abandonedRoutes{}
	ctx, cancel := context.WithCancel(context.Background())
	handler := reportAbandonedRequests(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		if len(got.routes) != 0 {
			t.Error("expected no report while the handler still runs")
		}
		cancel()
	}), got.record)

	serveWithContext(handler, ctx, "/api/sync/reconcile")

	if want := []string{"/api/sync/reconcile"}; !reflect.DeepEqual(got.routes, want) {
		t.Fatalf("expected the request abandoned mid-handler to be reported, got %#v", got.routes)
	}
}

func TestNewHandlerWiresTheAbandonedRequestHook(t *testing.T) {
	t.Parallel()
	got := &abandonedRoutes{}

	serveWithContext(NewHandler(Config{OnRequestAbandoned: got.record}), cancelledContext(), "/unknown")
	serveWithContext(NewHandler(Config{}), cancelledContext(), "/unknown")

	if want := []string{"/unknown"}; !reflect.DeepEqual(got.routes, want) {
		t.Fatalf("expected the configured hook to see the abandoned request, got %#v", got.routes)
	}
}

// TestReportAbandonedRequestsSeesARealClientTimeout proves the boundary the hook
// rests on: net/http cancels a request's context when its client times out
// and closes the connection, while the handler is still blocked.
func TestReportAbandonedRequestsSeesARealClientTimeout(t *testing.T) {
	t.Parallel()
	reported := make(chan string, 1)
	handler := reportAbandonedRequests(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}), func(route string) { reported <- route })
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client := &http.Client{Timeout: 200 * time.Millisecond}

	if response, err := client.Get(server.URL + "/api/status"); err == nil {
		_ = response.Body.Close()
		t.Fatal("expected the client to time out")
	}

	select {
	case route := <-reported:
		if route != "/api/status" {
			t.Fatalf("expected /api/status reported, got %q", route)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("expected the timed-out request to be reported")
	}
}
