package jdownloader

import (
	"context"
	"errors"
	"testing"

	jd "github.com/Disble/jdownloader-go/jdownloader"
)

// --- PackageStatusByDestination ---

func TestPackageStatusByDestinationAggregatesCrawlCountsForMatchingSaveTo(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{packages: []jd.CrawledPackage{
		{SaveTo: new(`C:\anime\Show`), OnlineCount: new(2), OfflineCount: new(0)},
		{SaveTo: new(`C:\anime\Other`), OnlineCount: new(5), OfflineCount: new(5)},
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
			{SaveTo: new(`C:\anime\Show`), Uuid: new(int64(42)), Running: new(true)},
			{SaveTo: new(`C:\anime\Other`), Uuid: new(int64(99)), Running: new(false)},
		},
		links: []jd.DownloadLink{
			{PackageUuid: new(int64(42)), Finished: new(false), Skipped: new(false), StatusIconKey: new("")},
			{PackageUuid: new(int64(99)), Finished: new(true), Skipped: new(false), StatusIconKey: new("")},
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

func TestPackageStatusByDestinationForwardsMatchedPackageErrorSignalsOnlyForDestination(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{}
	dl := &fakeDownloader{
		packages: []jd.DownloadPackage{
			{SaveTo: new(`C:\anime\Show`), Uuid: new(int64(42)), Running: new(false), Finished: new(false), StatusIconKey: new("error_file_not_found")},
			{SaveTo: new(`C:\anime\Other`), Uuid: new(int64(99)), Running: new(false), Finished: new(false), StatusIconKey: new("error_other_destination")},
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
	if len(status.PackageSignals) != 1 {
		t.Fatalf("expected only one matched package signal, got %#v", status.PackageSignals)
	}
	if status.PackageSignals[0].StatusIconKey != "error_file_not_found" {
		t.Fatalf("expected matched package StatusIconKey to be forwarded, got %#v", status.PackageSignals[0])
	}
}

func TestPackageStatusByDestinationPreservesUnknownPackageStateForMatchedErrorSignals(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{}
	dl := &fakeDownloader{
		packages: []jd.DownloadPackage{
			{SaveTo: new(`C:\anime\Show`), Uuid: new(int64(42)), StatusIconKey: new("error_file_not_found")},
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
	if status.CrawlOnlineCount != 0 || status.CrawlOfflineCount != 0 {
		t.Fatalf("expected zero crawl counts, got %#v", status)
	}
	if len(status.Links) != 0 {
		t.Fatalf("expected no link signals for package-only evidence, got %#v", status.Links)
	}
	if len(status.PackageSignals) != 1 {
		t.Fatalf("expected one matched package signal, got %#v", status.PackageSignals)
	}
	got := status.PackageSignals[0]
	if got.RunningObserved {
		t.Fatalf("expected RunningObserved=false when JD omits the Running pointer, got %#v", got)
	}
	if got.FinishedObserved {
		t.Fatalf("expected FinishedObserved=false when JD omits the Finished pointer, got %#v", got)
	}
	if got.StatusIconKey != "error_file_not_found" {
		t.Fatalf("expected matched package StatusIconKey to be forwarded, got %#v", got)
	}
	if got.Running || got.Finished {
		t.Fatalf("expected omitted booleans to remain false-valued payload fields, got %#v", got)
	}
}

func TestPackageStatusByDestinationReportsUnmatchedWhenNoSaveToEquals(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{packages: []jd.CrawledPackage{{SaveTo: new(`C:\anime\Other`), OnlineCount: new(1)}}}
	dl := &fakeDownloader{packages: []jd.DownloadPackage{{SaveTo: new(`C:\anime\Other`), Uuid: new(int64(1))}}}
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
	if len(status.PackageSignals) != 0 {
		t.Fatalf("expected no package signals when unmatched, got %#v", status.PackageSignals)
	}
}

// --- RemoveByDestination ---

func TestRemoveByDestinationRemovesMatchedCrawlAndDownloadPackages(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{packages: []jd.CrawledPackage{{SaveTo: new(`C:\anime\Show`), Uuid: new(int64(7))}}}
	dl := &fakeDownloader{packages: []jd.DownloadPackage{{SaveTo: new(`C:\anime\Show`), Uuid: new(int64(8))}}}
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
		packages:  []jd.CrawledPackage{{SaveTo: new(`C:\anime\Show`), Uuid: new(int64(7))}},
		removeErr: errors.New("remove failed"),
	}
	dl := &fakeDownloader{packages: []jd.DownloadPackage{{SaveTo: new(`C:\anime\Show`), Uuid: new(int64(8))}}}
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
