package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
)

// TestStartupWiresTheDownloadReadinessSeam pins the wiring, not the producer. The download
// service raises its scheduled-run attention notice only through this seam, so an unwired seam is
// indistinguishable from a producer that was never written.
func TestStartupWiresTheDownloadReadinessSeam(t *testing.T) {
	t.Parallel()

	var captured download.ServiceDeps
	app := newAppTestApp(t)
	app.newDownloadService = func(deps download.ServiceDeps) *download.Service {
		captured = deps
		return download.NewService(deps)
	}

	app.startup(context.Background())

	if captured.Readiness == nil {
		t.Fatal("startup built the download service with no readiness seam, so no scheduled run can ever warn about a blocked anime")
	}
}

// TestDownloadReadinessSeamResolvesAtCallTime is the reason the seam is a func rather than the
// service itself. Startup builds the download service BEFORE the readiness service exists, so a
// seam captured by value would be permanently nil; this one has to resolve on the call.
func TestDownloadReadinessSeamResolvesAtCallTime(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}

	if _, err := app.downloadReadinessSnapshot(context.Background()); err == nil {
		t.Fatal("readiness seam succeeded with no service wired, want an error rather than a fabricated empty snapshot")
	}

	app.readinessService = download.NewReadinessService(download.ReadinessServiceDeps{
		Animes:        &stubAnimeQueryService{},
		DownloadsRoot: func(context.Context) (string, error) { return "D:/Downloads", nil },
		Sites:         download.NewStaticRegistry(),
	})

	got, err := app.downloadReadinessSnapshot(context.Background())
	if err != nil {
		t.Fatalf("readiness seam after the service was wired = %v, want it to resolve through the field", err)
	}
	if got.Items == nil {
		t.Fatalf("readiness seam returned %#v, want the snapshot the service built", got)
	}
}

// TestDownloadReadinessSeamPropagatesAFailedQuery keeps a failed catalog read distinguishable
// from an empty one. The download service degrades either to silence, so a seam that swallowed the
// error would leave nothing anywhere saying a snapshot was ever attempted.
func TestDownloadReadinessSeamPropagatesAFailedQuery(t *testing.T) {
	t.Parallel()

	queryErr := errors.New("catalog unavailable")
	app := &App{
		ctx: context.Background(),
		readinessService: download.NewReadinessService(download.ReadinessServiceDeps{
			Animes:        &stubAnimeQueryService{err: queryErr},
			DownloadsRoot: func(context.Context) (string, error) { return "D:/Downloads", nil },
			Sites:         download.NewStaticRegistry(),
		}),
	}

	got, err := app.downloadReadinessSnapshot(context.Background())
	if !errors.Is(err, queryErr) {
		t.Fatalf("readiness seam error = %v, want it to carry %v", err, queryErr)
	}
	if got.Items != nil {
		t.Fatalf("failed readiness seam returned fabricated items: %#v", got.Items)
	}
}

// TestDownloadReadinessSeamHonorsTheCallersContext pins that the seam reads the run's own context
// rather than the app-wide one. A scheduled run that the user stops must not leave a catalog query
// running behind it.
func TestDownloadReadinessSeamHonorsTheCallersContext(t *testing.T) {
	t.Parallel()

	var seen context.Context
	app := &App{
		ctx: context.Background(),
		readinessService: download.NewReadinessService(download.ReadinessServiceDeps{
			Animes: &contextRecordingAnimeQuery{stubAnimeQueryService: &stubAnimeQueryService{}, onList: func(ctx context.Context) {
				seen = ctx
			}},
			DownloadsRoot: func(context.Context) (string, error) { return "D:/Downloads", nil },
			Sites:         download.NewStaticRegistry(),
		}),
	}

	type ctxKey struct{}
	runCtx := context.WithValue(context.Background(), ctxKey{}, "run")

	if _, err := app.downloadReadinessSnapshot(runCtx); err != nil {
		t.Fatalf("readiness seam = %v, want a snapshot", err)
	}
	if seen == nil || seen.Value(ctxKey{}) != "run" {
		t.Fatalf("catalog was queried with %#v, want the caller's context", seen)
	}
}

// contextRecordingAnimeQuery observes which context reaches the catalog read.
type contextRecordingAnimeQuery struct {
	*stubAnimeQueryService
	onList func(ctx context.Context)
}

// ListMobileAnimes records its context before delegating to the stub.
func (q *contextRecordingAnimeQuery) ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error) {
	q.onList(ctx)
	return q.stubAnimeQueryService.ListMobileAnimes(ctx)
}

// TestDownloadReadinessSeamErrorNamesTheUnwiredService keeps the nil-service message specific, so
// "no snapshot" never reads the same as "empty catalog".
func TestDownloadReadinessSeamErrorNamesTheUnwiredService(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}

	_, err := app.downloadReadinessSnapshot(context.Background())
	if err == nil || !strings.Contains(err.Error(), "not wired at startup") {
		t.Fatalf("readiness seam error = %v, want it to name the unwired service", err)
	}
}
