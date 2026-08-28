package jdownloader

import (
	"context"
	"errors"
	"testing"

	jd "github.com/Disble/jdownloader-go/jdownloader"
)

// renameFixture wires a device whose downloader holds one package pointing at
// destination and the links the test wants matched against it.
func renameFixture(destination string, links []jd.DownloadLink) (*fakeDownloader, *myJDAdapter) {
	dl := &fakeDownloader{
		packages: []jd.DownloadPackage{{SaveTo: new(destination), Uuid: new(int64(7))}},
		links:    links,
	}
	client := &fakeJdClient{device: &fakeDevice{lg: &fakeLinkGrabber{}, dl: dl}}
	return dl, newWithClient(client)
}

func TestRenameEpisodeByDestinationRenamesTheFinishedLinkKeepingItsExtension(t *testing.T) {
	t.Parallel()

	const dest = `D:\Anime\NegaPosi Angler`
	dl, adapter := renameFixture(dest, []jd.DownloadLink{
		{Uuid: new(int64(42)), PackageUuid: new(int64(7)), Finished: new(true), FinishedDate: new(int64(500)), Name: new("qk2rlwv6tci3.mp4")},
	})

	got, err := adapter.RenameEpisodeByDestination(context.Background(), "MyPC", dest, "NegaPosi Angler - 04")
	if err != nil {
		t.Fatalf("expected rename to succeed, got: %v", err)
	}

	if dl.renamedLinkID != 42 {
		t.Fatalf("expected JD to be asked to rename link 42, got %d", dl.renamedLinkID)
	}
	if dl.renamedTo != "NegaPosi Angler - 04.mp4" {
		t.Fatalf("expected the downloaded extension to be preserved, got %q", dl.renamedTo)
	}
	if got != "NegaPosi Angler - 04.mp4" {
		t.Fatalf("expected the applied name returned, got %q", got)
	}
}

func TestRenameEpisodeByDestinationPicksTheMostRecentlyFinishedLink(t *testing.T) {
	t.Parallel()

	const dest = `D:\Anime\NegaPosi Angler`
	dl, adapter := renameFixture(dest, []jd.DownloadLink{
		{Uuid: new(int64(1)), PackageUuid: new(int64(7)), Finished: new(true), FinishedDate: new(int64(100)), Name: new("old.mp4")},
		{Uuid: new(int64(2)), PackageUuid: new(int64(7)), Finished: new(true), FinishedDate: new(int64(900)), Name: new("new.mkv")},
	})

	if _, err := adapter.RenameEpisodeByDestination(context.Background(), "MyPC", dest, "Show - 07"); err != nil {
		t.Fatalf("expected rename to succeed, got: %v", err)
	}

	if dl.renamedLinkID != 2 {
		t.Fatalf("expected the newest finished link (2) to be renamed, got %d", dl.renamedLinkID)
	}
	if dl.renamedTo != "Show - 07.mkv" {
		t.Fatalf("expected the newest link's extension, got %q", dl.renamedTo)
	}
}

func TestRenameEpisodeByDestinationIgnoresLinksFromOtherFolders(t *testing.T) {
	t.Parallel()

	const dest = `D:\Anime\NegaPosi Angler`
	dl, adapter := renameFixture(dest, []jd.DownloadLink{
		{Uuid: new(int64(99)), PackageUuid: new(int64(8)), Finished: new(true), FinishedDate: new(int64(900)), Name: new("other.mp4")},
	})

	_, err := adapter.RenameEpisodeByDestination(context.Background(), "MyPC", dest, "Show - 07")
	if !errors.Is(err, ErrNoRenamableLink) {
		t.Fatalf("expected ErrNoRenamableLink when no link belongs to the folder, got: %v", err)
	}
	if dl.renamedLinkID != 0 {
		t.Fatalf("expected no rename call, got link %d", dl.renamedLinkID)
	}
}

func TestRenameEpisodeByDestinationIgnoresUnfinishedLinks(t *testing.T) {
	t.Parallel()

	const dest = `D:\Anime\NegaPosi Angler`
	dl, adapter := renameFixture(dest, []jd.DownloadLink{
		{Uuid: new(int64(5)), PackageUuid: new(int64(7)), Finished: new(false), Name: new("downloading.mp4")},
	})

	_, err := adapter.RenameEpisodeByDestination(context.Background(), "MyPC", dest, "Show - 07")
	if !errors.Is(err, ErrNoRenamableLink) {
		t.Fatalf("expected ErrNoRenamableLink while the link is still downloading, got: %v", err)
	}
	if dl.renamedLinkID != 0 {
		t.Fatalf("expected no rename call for an unfinished link, got link %d", dl.renamedLinkID)
	}
}

// JDownloader routinely saves a package into its own subfolder of the anime folder, so the
// package SaveTo is a DESCENDANT of the destination Bridge asked about, never equal to it.
// Matching those exactly finds nothing and silently skips the rename -- the episode then
// keeps its hoster name once the Flattener lifts it to the root.
func TestRenameEpisodeByDestinationMatchesPackagesSavedInASubfolder(t *testing.T) {
	t.Parallel()

	const dest = `D:\Anime\Bleach Sennen Kessen-hen - Kashin-tan`
	dl := &fakeDownloader{
		packages: []jd.DownloadPackage{{SaveTo: new(dest + `\bleeeacccchthounnnsandyearrbloodkashiitensvs-02`), Uuid: new(int64(7))}},
		links: []jd.DownloadLink{
			{Uuid: new(int64(42)), PackageUuid: new(int64(7)), Finished: new(true), FinishedDate: new(int64(500)), Name: new("bleeeacccchthounnnsandyearrbloodkashiitensvs-02.mp4")},
		},
	}
	client := &fakeJdClient{device: &fakeDevice{lg: &fakeLinkGrabber{}, dl: dl}}
	adapter := newWithClient(client)

	got, err := adapter.RenameEpisodeByDestination(context.Background(), "MyPC", dest, "Bleach Sennen Kessen-hen - Kashin-tan - 02")
	if err != nil {
		t.Fatalf("expected a package saved in a subfolder to be renamable, got: %v", err)
	}
	if got != "Bleach Sennen Kessen-hen - Kashin-tan - 02.mp4" {
		t.Fatalf("applied name = %q", got)
	}
	if dl.renamedLinkID != 42 {
		t.Fatalf("expected link 42 renamed, got %d", dl.renamedLinkID)
	}
}

// A sibling folder sharing a name prefix must NOT be treated as inside the destination.
func TestRenameEpisodeByDestinationIgnoresSiblingFoldersSharingAPrefix(t *testing.T) {
	t.Parallel()

	const dest = `D:\Anime\Bleach`
	dl := &fakeDownloader{
		packages: []jd.DownloadPackage{{SaveTo: new(`D:\Anime\Bleach Sennen Kessen-hen`), Uuid: new(int64(7))}},
		links:    []jd.DownloadLink{{Uuid: new(int64(42)), PackageUuid: new(int64(7)), Finished: new(true), Name: new("x.mp4")}},
	}
	adapter := newWithClient(&fakeJdClient{device: &fakeDevice{lg: &fakeLinkGrabber{}, dl: dl}})

	if _, err := adapter.RenameEpisodeByDestination(context.Background(), "MyPC", dest, "Bleach - 01"); !errors.Is(err, ErrNoRenamableLink) {
		t.Fatalf("expected a prefix-sharing sibling to be ignored, got: %v", err)
	}
}
