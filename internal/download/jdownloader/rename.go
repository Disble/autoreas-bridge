package jdownloader

import (
	"context"
	"errors"
	"fmt"
	"path"

	jd "github.com/Disble/jdownloader-go/jdownloader"
)

// ErrNoRenamableLink reports that JDownloader holds no finished link for the folder, so
// there is nothing it can be asked to rename. Callers treat this as non-fatal: the episode
// is already on disk, and a naming problem must never turn a successful download into a
// failed one.
var ErrNoRenamableLink = errors.New("jdownloader: no finished link for destination")

// RenameEpisodeByDestination asks JDownloader to rename the episode it just finished in
// destination to baseName, keeping the extension JD downloaded. It returns the applied file
// name.
//
// The rename is delegated to JD rather than performed with os.Rename so JD's own record of
// the file stays correct -- a file Bridge moves behind JD's back leaves JD pointing at a path
// that no longer exists. That ownership is also why this MUST run before the Flattener: once
// Bridge moves the file out of JD's package subfolder, JD can no longer find it to rename.
//
// Correlation is by destination folder, the same key PackageStatusByDestination uses, because
// Bridge holds no link identity of its own (AddAndStart discards the LinkGrabber's response).
func (a *myJDAdapter) RenameEpisodeByDestination(ctx context.Context, deviceName, destination, baseName string) (string, error) {
	if ctx.Err() != nil {
		return "", ctx.Err()
	}

	device, err := a.client.Device(deviceName)
	if err != nil {
		return "", fmt.Errorf("jdownloader: get device %s: %w", deviceName, err)
	}

	matched, err := packagesUnderDestination(device, destination)
	if err != nil {
		return "", err
	}
	if len(matched) == 0 {
		return "", ErrNoRenamableLink
	}

	links, err := device.Downloader().Links()
	if err != nil {
		return "", fmt.Errorf("jdownloader: query download links: %w", err)
	}

	target := newestFinishedLink(links, matched)
	if target == nil {
		return "", ErrNoRenamableLink
	}

	applied := baseName + path.Ext(stringValue(target.Name))
	if err := device.Downloader().Rename(*target.Uuid, applied); err != nil {
		return "", fmt.Errorf("jdownloader: rename link %d: %w", *target.Uuid, err)
	}
	return applied, nil
}

// packagesUnderDestination returns the UUIDs of every download package saved at, or
// anywhere beneath, destination.
//
// This deliberately does NOT reuse matchedDownloadPackages, which matches SaveTo exactly.
// Exact matching is right for the status/removal seams, whose meaning is "the package for
// this folder", but it silently finds nothing whenever JD saves into a package subfolder --
// which is the common case, and which made every such episode keep its hoster name.
func packagesUnderDestination(device jd.Device, destination string) (map[int64]bool, error) {
	packages, err := device.Downloader().Packages()
	if err != nil {
		return nil, fmt.Errorf("jdownloader: query download packages: %w", err)
	}

	matched := map[int64]bool{}
	for _, pkg := range *packages {
		if pkg.SaveTo == nil || pkg.Uuid == nil {
			continue
		}
		if destinationCovers(destination, *pkg.SaveTo) {
			matched[*pkg.Uuid] = true
		}
	}
	return matched, nil
}

// newestFinishedLink returns the finished link with the latest FinishedDate among the
// packages matching the destination, or nil when none has finished yet.
//
// "Newest finished" is the JD-side equivalent of the filesystem renamer's "most recently
// modified video at the folder root": the pipeline downloads one episode at a time per
// folder, so the link JD finished last is the episode that just landed.
func newestFinishedLink(links *[]jd.DownloadLink, matched map[int64]bool) *jd.DownloadLink {
	if links == nil {
		return nil
	}

	var newest *jd.DownloadLink
	var newestFinishedAt int64
	for i := range *links {
		link := &(*links)[i]
		if link.Uuid == nil || link.PackageUuid == nil || !matched[*link.PackageUuid] {
			continue
		}
		if !boolValue(link.Finished) {
			continue
		}
		finishedAt := int64(0)
		if link.FinishedDate != nil {
			finishedAt = *link.FinishedDate
		}
		if newest == nil || finishedAt > newestFinishedAt {
			newest = link
			newestFinishedAt = finishedAt
		}
	}
	return newest
}
