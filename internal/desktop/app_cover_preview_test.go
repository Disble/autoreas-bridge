package desktop

import (
	"context"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/api/contracts"
)

// recordingCoverThumbnails serves one canned desktop outcome and records every value it was asked for.
type recordingCoverThumbnails struct {
	result cover.ThumbnailResult
	err    error
	asked  *[]string
}

// GetDesktop records the requested value and returns the canned outcome.
func (s recordingCoverThumbnails) GetDesktop(_ context.Context, path string) (cover.ThumbnailResult, error) {
	*s.asked = append(*s.asked, path)
	return s.result, s.err
}

// GetHTTP is never used by the preview binding.
func (s recordingCoverThumbnails) GetHTTP(context.Context, string) (cover.ThumbnailResult, error) {
	return cover.ThumbnailResult{}, errors.New("the preview binding must not use the HTTP path")
}

// TestPreviewAnimeCoverServesTheTypedValueThroughTheSharedService proves an unsaved cover value
// (the editor's draft) is rendered by the same thumbnail service a saved cover uses.
func TestPreviewAnimeCoverServesTheTypedValueThroughTheSharedService(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background(), coverThumbnails: coverService(t, coverFetcher{data: tallJPEG(t)})}
	got := app.PreviewAnimeCover("https://cdn.example.com/draft.jpg")

	if got.Source != contracts.CoverSourceCover || !strings.HasPrefix(got.DataURL, coverDataURLPrefix) {
		t.Fatalf("preview = %#v, want a JPEG data URL cover", got)
	}
}

// TestPreviewAnimeCoverDegradesToThePlaceholder proves every unrenderable value answers the
// placeholder signal, never an error, and that a blank or sentinel value never reaches the service.
func TestPreviewAnimeCoverDegradesToThePlaceholder(t *testing.T) {
	t.Parallel()

	served := cover.ThumbnailResult{Bytes: []byte{0x01}, ETag: `"one"`}
	cases := []struct {
		name      string
		value     string
		result    cover.ThumbnailResult
		err       error
		wantAsked []string
		wantCover bool
	}{
		{name: "empty value", value: "", result: served},
		{name: "blank value", value: "   ", result: served},
		{name: "legacy null sentinel", value: "null", result: served},
		{name: "unreadable source", value: "D:/missing.jpg", err: errors.New("not found"), wantAsked: []string{"D:/missing.jpg"}},
		{name: "error beside bytes", value: "D:/a.jpg", result: served, err: errors.New("failed anyway"), wantAsked: []string{"D:/a.jpg"}},
		{name: "no bytes without an error", value: "D:/a.jpg", wantAsked: []string{"D:/a.jpg"}},
		{name: "a trimmed value is served", value: "  D:/a.jpg  ", result: served, wantAsked: []string{"D:/a.jpg"}, wantCover: true},
	}
	for _, tc := range cases {
		var asked []string
		app := &App{ctx: context.Background(), coverThumbnails: recordingCoverThumbnails{result: tc.result, err: tc.err, asked: &asked}}
		got := app.PreviewAnimeCover(tc.value)
		if (got.Source == contracts.CoverSourceCover) != tc.wantCover {
			t.Fatalf("%s: source = %q, want a cover: %v", tc.name, got.Source, tc.wantCover)
		}
		if !tc.wantCover && got.DataURL != "" {
			t.Fatalf("%s: placeholder carried a data URL %q", tc.name, got.DataURL)
		}
		if strings.Join(asked, "|") != strings.Join(tc.wantAsked, "|") {
			t.Fatalf("%s: service asked for %q, want %q", tc.name, asked, tc.wantAsked)
		}
	}

	if got := (&App{ctx: context.Background()}).PreviewAnimeCover("D:/a.jpg"); got.Source != contracts.CoverSourcePlaceholder {
		t.Fatalf("nil cover service: source = %q, want the placeholder", got.Source)
	}
}
