package jdownloader

import (
	"context"
	"errors"
	"fmt"
	"path"
	"runtime"
	"strings"

	jd "github.com/rkosegi/jdownloader-go/jdownloader"
)

// normDest normalizes a JD-reported or locally-known destination path so two representations of
// the same folder compare equal regardless of separator style, trailing separators, or
// `.`-relative segments (design.md "Correlate strictly by normalized SaveTo == Carpeta"). JD
// echoes SaveTo back with backslashes and/or trailing separators depending on the device OS, so
// normalization is mandatory for a reliable match.
func normDest(dest string) string {
	unified := strings.ReplaceAll(dest, `\`, "/")
	cleaned := path.Clean(unified)
	cleaned = strings.TrimSuffix(cleaned, "/")
	if runtime.GOOS == "windows" {
		cleaned = strings.ToLower(cleaned)
	}
	return cleaned
}

// sameDestination reports whether a and b normalize to the same destination folder.
func sameDestination(a, b string) bool {
	return normDest(a) == normDest(b)
}

// boolValue returns a boolean pointer value or false when nil.
func boolValue(b *bool) bool {
	if b == nil {
		return false
	}
	return *b
}

// observedBool preserves whether JD actually sent a boolean pointer.
func observedBool(b *bool) (bool, bool) {
	if b == nil {
		return false, false
	}
	return *b, true
}

// stringValue returns a string pointer value or an empty string when nil.
func stringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// PackageStatusByDestination aggregates neutral JD signals for every crawl/download package whose
// SaveTo normalizes-equal to destination (design.md "Correlate strictly by normalized
// SaveTo == Carpeta"). It queries LinkGrabber().Packages() for crawl-stage availability counts and
// Downloader().Packages()+Downloader().Links() for download-stage package/link signals, never
// leaking JD library types past the DestinationStatus/PackageSignal/LinkSignal boundary.
func (a *myJDAdapter) PackageStatusByDestination(ctx context.Context, deviceName, destination string) (DestinationStatus, error) {
	device, err := a.client.Device(deviceName)
	if err != nil {
		return DestinationStatus{}, fmt.Errorf("jdownloader: get device %s: %w", deviceName, err)
	}
	status, err := crawlStatus(device, destination)
	if err != nil {
		return DestinationStatus{}, err
	}
	matchedDownloadUUIDs, runningByUUID, err := matchedDownloadPackages(device, destination, &status)
	if err != nil {
		return DestinationStatus{}, err
	}
	if err := appendDownloadLinks(device, matchedDownloadUUIDs, runningByUUID, &status); err != nil {
		return DestinationStatus{}, err
	}
	return status, nil
}

// crawlStatus aggregates crawl-stage status for a destination.
func crawlStatus(device jd.Device, destination string) (DestinationStatus, error) {
	packages, err := device.LinkGrabber().Packages()
	if err != nil {
		return DestinationStatus{}, fmt.Errorf("jdownloader: query crawl packages: %w", err)
	}
	status := DestinationStatus{}
	for _, pkg := range *packages {
		if pkg.SaveTo == nil || !sameDestination(*pkg.SaveTo, destination) {
			continue
		}
		status.Matched = true
		status.CrawlOnlineCount += intValue(pkg.OnlineCount)
		status.CrawlOfflineCount += intValue(pkg.OfflineCount)
	}
	return status, nil
}

// intValue returns an integer pointer value or zero when nil.
func intValue(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

// matchedDownloadPackages finds download packages matching a destination.
func matchedDownloadPackages(device jd.Device, destination string, status *DestinationStatus) (map[int64]bool, map[int64]bool, error) {
	downloadPackages, err := device.Downloader().Packages()
	if err != nil {
		return nil, nil, fmt.Errorf("jdownloader: query download packages: %w", err)
	}
	// runningByUUID carries each matched package's download-stage Running flag down to its
	// links -- the underlying jdownloader-go DownloadLink type has no per-link Running field
	// (only DownloadPackage does), so package-level Running is the only signal source available.
	matchedDownloadUUIDs := map[int64]bool{}
	runningByUUID := map[int64]bool{}
	for _, pkg := range *downloadPackages {
		if pkg.SaveTo == nil || !sameDestination(*pkg.SaveTo, destination) {
			continue
		}
		status.Matched = true
		finished, finishedObserved := observedBool(pkg.Finished)
		running, runningObserved := observedBool(pkg.Running)
		status.PackageSignals = append(status.PackageSignals, PackageSignal{
			Finished:         finished,
			Running:          running,
			FinishedObserved: finishedObserved,
			RunningObserved:  runningObserved,
			StatusIconKey:    stringValue(pkg.StatusIconKey),
		})
		if pkg.Uuid != nil {
			matchedDownloadUUIDs[*pkg.Uuid] = true
			runningByUUID[*pkg.Uuid] = running
		}
	}
	return matchedDownloadUUIDs, runningByUUID, nil
}

// appendDownloadLinks appends link signals for matched download packages.
func appendDownloadLinks(device jd.Device, matched map[int64]bool, running map[int64]bool, status *DestinationStatus) error {
	if len(matched) == 0 {
		return nil
	}
	links, err := device.Downloader().Links()
	if err != nil {
		return fmt.Errorf("jdownloader: query download links: %w", err)
	}
	for _, link := range *links {
		if link.PackageUuid == nil || !matched[*link.PackageUuid] {
			continue
		}
		status.Links = append(status.Links, LinkSignal{Finished: boolValue(link.Finished), Running: running[*link.PackageUuid], Skipped: boolValue(link.Skipped), StatusIconKey: stringValue(link.StatusIconKey)})
	}
	return nil
}

// RemoveByDestination removes every crawl/download package whose SaveTo normalizes-equal to
// destination (design-orch "Dead Package Removed From JD Before Advancing"). Both removal calls
// are attempted even if one fails; errors are joined and returned to the caller, which MUST treat
// them as non-fatal (log Warn and continue advancing the fallback loop).
func (a *myJDAdapter) RemoveByDestination(ctx context.Context, deviceName, destination string) error {
	device, err := a.client.Device(deviceName)
	if err != nil {
		return fmt.Errorf("jdownloader: get device %s: %w", deviceName, err)
	}

	return errors.Join(a.removeCrawlPackages(device, destination), a.removeDownloadPackages(device, destination))
}

// removeCrawlPackages removes crawl packages matching a destination.
func (a *myJDAdapter) removeCrawlPackages(device jd.Device, destination string) error {
	packages, err := device.LinkGrabber().Packages()
	if err != nil {
		return fmt.Errorf("jdownloader: query crawl packages: %w", err)
	}
	ids := matchingCrawlPackageIDs(*packages, destination)
	if len(ids) == 0 {
		return nil
	}
	if err := device.LinkGrabber().Remove(nil, ids); err != nil {
		return fmt.Errorf("jdownloader: remove crawl packages: %w", err)
	}
	return nil
}

// removeDownloadPackages removes download packages matching a destination.
func (a *myJDAdapter) removeDownloadPackages(device jd.Device, destination string) error {
	packages, err := device.Downloader().Packages()
	if err != nil {
		return fmt.Errorf("jdownloader: query download packages: %w", err)
	}
	ids := matchingDownloadPackageIDs(*packages, destination)
	if len(ids) == 0 {
		return nil
	}
	if err := device.Downloader().Remove(nil, ids); err != nil {
		return fmt.Errorf("jdownloader: remove download packages: %w", err)
	}
	return nil
}

// matchingCrawlPackageIDs returns crawl package IDs matching a destination.
func matchingCrawlPackageIDs(packages []jd.CrawledPackage, destination string) []int64 {
	ids := make([]int64, 0, len(packages))
	for _, pkg := range packages {
		if pkg.SaveTo != nil && pkg.Uuid != nil && sameDestination(*pkg.SaveTo, destination) {
			ids = append(ids, *pkg.Uuid)
		}
	}
	return ids
}

// matchingDownloadPackageIDs returns download package IDs matching a destination.
func matchingDownloadPackageIDs(packages []jd.DownloadPackage, destination string) []int64 {
	ids := make([]int64, 0, len(packages))
	for _, pkg := range packages {
		if pkg.SaveTo != nil && pkg.Uuid != nil && sameDestination(*pkg.SaveTo, destination) {
			ids = append(ids, *pkg.Uuid)
		}
	}
	return ids
}
