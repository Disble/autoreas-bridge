package jdownloader

import (
	"context"
	"errors"
	"testing"

	jd "github.com/rkosegi/jdownloader-go/jdownloader"
)

// intPtr returns a pointer to an integer value.
func intPtr(i int) *int { return &i }

// int64Ptr returns a pointer to an int64 value.
func int64Ptr(i int64) *int64 { return &i }

// strPtr returns a pointer to a string value.
func strPtr(s string) *string { return &s }

// --- PackageStatusByDestination ---

func TestPackageStatusByDestinationAggregatesCrawlCountsForMatchingSaveTo(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{packages: []jd.CrawledPackage{
		{SaveTo: strPtr(`C:\anime\Show`), OnlineCount: intPtr(2), OfflineCount: intPtr(0)},
		{SaveTo: strPtr(`C:\anime\Other`), OnlineCount: intPtr(5), OfflineCount: intPtr(5)},
	}}
	dl := &fakeDownloader{}
	device := &fakeDevice{lg: lg, dl: dl}
	fake := &fakeJdClient{devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}}, device: device}
	adapter := newWithClient(fake)

	status, err := adapter.PackageStatusByDestination(context.Background(), "MyPC", "C:/anime/Show")
	if err != nil {
		t.Fatalf("PackageStatusByDestination: %v", err)
	}
	if !status.Matched {
		t.Fatal("expected Matched=true for a package whose SaveTo normalizes-equal to destination")
	}
	if status.CrawlOnlineCount != 2 || status.CrawlOfflineCount != 0 {
		t.Fatalf("expected aggregated crawl counts from the matching package only, got %#v", status)
	}
}

func TestPackageStatusByDestinationPopulatesLinkSignalsFromMatchedDownloadPackage(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{}
	dl := &fakeDownloader{
		packages: []jd.DownloadPackage{
			{SaveTo: strPtr(`C:\anime\Show`), Uuid: int64Ptr(42), Running: boolPtr(true)},
			{SaveTo: strPtr(`C:\anime\Other`), Uuid: int64Ptr(99), Running: boolPtr(false)},
		},
		links: []jd.DownloadLink{
			{PackageUuid: int64Ptr(42), Finished: boolPtr(false), Skipped: boolPtr(false), StatusIconKey: strPtr("")},
			{PackageUuid: int64Ptr(99), Finished: boolPtr(true), Skipped: boolPtr(false), StatusIconKey: strPtr("")},
		},
	}
	device := &fakeDevice{lg: lg, dl: dl}
	fake := &fakeJdClient{devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}}, device: device}
	adapter := newWithClient(fake)

	status, err := adapter.PackageStatusByDestination(context.Background(), "MyPC", "C:/anime/Show")
	if err != nil {
		t.Fatalf("PackageStatusByDestination: %v", err)
	}
	if !status.Matched {
		t.Fatal("expected Matched=true")
	}
	if len(status.Links) != 1 {
		t.Fatalf("expected only the matched package's link (uuid 42), got %#v", status.Links)
	}
	if !status.Links[0].Running || status.Links[0].Finished || status.Links[0].Skipped {
		t.Fatalf("expected Running=true, Finished=false, Skipped=false, got %#v", status.Links[0])
	}
}

func TestPackageStatusByDestinationReportsUnmatchedWhenNoSaveToEquals(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{packages: []jd.CrawledPackage{{SaveTo: strPtr(`C:\anime\Other`), OnlineCount: intPtr(1)}}}
	dl := &fakeDownloader{packages: []jd.DownloadPackage{{SaveTo: strPtr(`C:\anime\Other`), Uuid: int64Ptr(1)}}}
	device := &fakeDevice{lg: lg, dl: dl}
	fake := &fakeJdClient{devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}}, device: device}
	adapter := newWithClient(fake)

	status, err := adapter.PackageStatusByDestination(context.Background(), "MyPC", "C:/anime/Show")
	if err != nil {
		t.Fatalf("PackageStatusByDestination: %v", err)
	}
	if status.Matched {
		t.Fatal("expected Matched=false when no SaveTo matches destination")
	}
	if status.CrawlOnlineCount != 0 || status.CrawlOfflineCount != 0 || len(status.Links) != 0 {
		t.Fatalf("expected zero counts and no links when unmatched, got %#v", status)
	}
}

// --- RemoveByDestination ---

func TestRemoveByDestinationRemovesMatchedCrawlAndDownloadPackages(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{packages: []jd.CrawledPackage{{SaveTo: strPtr(`C:\anime\Show`), Uuid: int64Ptr(7)}}}
	dl := &fakeDownloader{packages: []jd.DownloadPackage{{SaveTo: strPtr(`C:\anime\Show`), Uuid: int64Ptr(8)}}}
	device := &fakeDevice{lg: lg, dl: dl}
	fake := &fakeJdClient{devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}}, device: device}
	adapter := newWithClient(fake)

	if err := adapter.RemoveByDestination(context.Background(), "MyPC", "C:/anime/Show"); err != nil {
		t.Fatalf("RemoveByDestination: %v", err)
	}
	if len(lg.removePackageIDs) != 1 || lg.removePackageIDs[0] != 7 {
		t.Fatalf("expected LinkGrabber.Remove to be called with package uuid 7, got %v", lg.removePackageIDs)
	}
	if len(dl.removePackageIDs) != 1 || dl.removePackageIDs[0] != 8 {
		t.Fatalf("expected Downloader.Remove to be called with package uuid 8, got %v", dl.removePackageIDs)
	}
}

func TestRemoveByDestinationReturnsErrorWhenUnderlyingRemoveFails(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{
		packages:  []jd.CrawledPackage{{SaveTo: strPtr(`C:\anime\Show`), Uuid: int64Ptr(7)}},
		removeErr: errors.New("remove failed"),
	}
	dl := &fakeDownloader{packages: []jd.DownloadPackage{{SaveTo: strPtr(`C:\anime\Show`), Uuid: int64Ptr(8)}}}
	device := &fakeDevice{lg: lg, dl: dl}
	fake := &fakeJdClient{devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}}, device: device}
	adapter := newWithClient(fake)

	if err := adapter.RemoveByDestination(context.Background(), "MyPC", "C:/anime/Show"); err == nil {
		t.Fatal("expected RemoveByDestination to surface the underlying Remove error")
	}
}

// --- normDest / sameDestination ---

func TestSameDestinationNormalizesWindowsSeparatorsTrailingSlashDotSegmentsAndCase(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		a, b string
		want bool
	}{
		{"identical", "C:/anime/Show", "C:/anime/Show", true},
		{"backslash-vs-forward-slash", `C:\anime\Show`, "C:/anime/Show", true},
		{"trailing-slash", "C:/anime/Show/", "C:/anime/Show", true},
		{"dot-segment", "C:/anime/./Show", "C:/anime/Show", true},
		{"case-insensitive", "C:/Anime/SHOW", "c:/anime/show", true},
		{"different-folder", "C:/anime/Show", "C:/anime/OtherShow", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := sameDestination(tc.a, tc.b)
			if got != tc.want {
				t.Fatalf("sameDestination(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
			}
		})
	}
}
