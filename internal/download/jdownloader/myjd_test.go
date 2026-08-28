package jdownloader

import (
	"context"
	"errors"
	"testing"
	"time"

	jd "github.com/Disble/jdownloader-go/jdownloader"
)

// fakeJdClient implements the real jdownloader.JdClient interface (the library's own contract)
// so myJDAdapter is tested against the actual seam it depends on, without hitting the network
// (AGENTS real-boundary rule: fake the network, not our own abstraction).
type fakeJdClient struct {
	connectErr   error
	devices      []jd.DeviceInfo
	listErr      error
	device       jd.Device
	deviceErr    error
	disconnected bool
}

func (f *fakeJdClient) Connect() error     { return f.connectErr }
func (f *fakeJdClient) IsConnected() bool  { return f.connectErr == nil }
func (f *fakeJdClient) Reconnect() error   { return nil }
func (f *fakeJdClient) Disconnect() error  { f.disconnected = true; return nil }
func (f *fakeJdClient) ConfigHash() string { return "fake-config-hash" }
func (f *fakeJdClient) ListDevices() (*[]jd.DeviceInfo, error) {
	if f.listErr != nil {
		return nil, f.listErr
	}
	devs := f.devices
	return &devs, nil
}
func (f *fakeJdClient) Device(name string) (jd.Device, error) {
	if f.deviceErr != nil {
		return nil, f.deviceErr
	}
	return f.device, nil
}

// fakeDevice/fakeLinkGrabber/fakeDownloader satisfy jd.Device/jd.LinkGrabber/jd.Downloader for
// the AddAndStart and PackagesFinished tests.
type fakeDevice struct {
	lg jd.LinkGrabber
	dl jd.Downloader
}

func (d *fakeDevice) LinkGrabber() jd.LinkGrabber { return d.lg }
func (d *fakeDevice) Downloader() jd.Downloader   { return d.dl }
func (d *fakeDevice) Name() string                { return "fake-device" }
func (d *fakeDevice) Id() string                  { return "fake-id" }
func (d *fakeDevice) Status() string              { return "ONLINE" }
func (d *fakeDevice) ConnectionInfo() (*jd.DirectConnectionInfo, error) {
	return nil, nil
}

type fakeLinkGrabber struct {
	addErr           error
	capturedLinks    []string
	capturedOpts     []jd.AddLinksOptions
	packages         []jd.CrawledPackage
	packagesErr      error
	removeLinkIDs    []int64
	removePackageIDs []int64
	removeErr        error
}

func (l *fakeLinkGrabber) Clear() error { return nil }
func (l *fakeLinkGrabber) Packages(...jd.LinkGrabberQueryPackagesOptions) (*[]jd.CrawledPackage, error) {
	if l.packagesErr != nil {
		return nil, l.packagesErr
	}
	pkgs := l.packages
	return &pkgs, nil
}
func (l *fakeLinkGrabber) Links(...jd.LinkGrabberQueryLinksOptions) (*[]jd.CrawledLink, error) {
	return &[]jd.CrawledLink{}, nil
}
func (l *fakeLinkGrabber) Add(links []string, opts ...jd.AddLinksOptions) (*jd.DataResponse, error) {
	l.capturedLinks = links
	l.capturedOpts = opts
	if l.addErr != nil {
		return nil, l.addErr
	}
	return &jd.DataResponse{}, nil
}
func (l *fakeLinkGrabber) IsCollecting() (bool, error) { return false, nil }
func (l *fakeLinkGrabber) Remove(linkIDs []int64, packageIDs []int64) error {
	l.removeLinkIDs = linkIDs
	l.removePackageIDs = packageIDs
	return l.removeErr
}
func (l *fakeLinkGrabber) RenameLink(_ int64, _ string) error { return nil }

type fakeDownloader struct {
	packages         []jd.DownloadPackage
	err              error
	links            []jd.DownloadLink
	removeLinkIDs    []int64
	removePackageIDs []int64
	removeErr        error
	renamedLinkID    int64
	renamedTo        string
	renameErr        error
}

func (d *fakeDownloader) Packages(...jd.DownloadQueryPackagesOptions) (*[]jd.DownloadPackage, error) {
	if d.err != nil {
		return nil, d.err
	}
	pkgs := d.packages
	return &pkgs, nil
}
func (d *fakeDownloader) Links(...jd.DownloadQueryLinksOptions) (*[]jd.DownloadLink, error) {
	links := d.links
	return &links, nil
}
func (d *fakeDownloader) Rename(linkID int64, name string) error {
	d.renamedLinkID = linkID
	d.renamedTo = name
	return d.renameErr
}
func (d *fakeDownloader) Remove(linkIDs []int64, packageIDs []int64) error {
	d.removeLinkIDs = linkIDs
	d.removePackageIDs = packageIDs
	return d.removeErr
}
func (d *fakeDownloader) Start() (bool, error)                  { return true, nil }
func (d *fakeDownloader) Stop() (bool, error)                   { return true, nil }
func (d *fakeDownloader) Pause() (bool, error)                  { return true, nil }
func (d *fakeDownloader) Speed() (*jd.DownloadSpeedInfo, error) { return &jd.DownloadSpeedInfo{}, nil }
func (d *fakeDownloader) Force(_ []int64, _ []int64) error      { return nil }
func (d *fakeDownloader) State() (*jd.DownloadState, error)     { return &jd.DownloadState{}, nil }

// --- EnsureOnline / ListDevices liveness gate (4.7) ---

func TestEnsureOnlineSucceedsWhenConnectOkAndDeviceListedOnline(t *testing.T) {
	t.Parallel()

	fake := &fakeJdClient{
		devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}},
	}
	adapter := newWithClient(fake, withLaunchTimeout(10*time.Millisecond), withLaunchPoll(1*time.Millisecond))

	if err := adapter.EnsureOnline(context.Background(), "MyPC", false); err != nil {
		t.Fatalf("expected EnsureOnline to succeed, got: %v", err)
	}
}

func TestEnsureOnlineTreatsConnectSucceedingWhileDeviceOfflineAsOffline(t *testing.T) {
	t.Parallel()

	// Connect() succeeds (no connectErr) but the device is simply absent from ListDevices --
	// this is the PoC #12 quirk: Connect succeeding is NOT proof of liveness.
	fake := &fakeJdClient{
		devices: []jd.DeviceInfo{{Name: "OtherPC", Status: "ONLINE"}},
	}
	adapter := newWithClient(fake, withLaunchTimeout(10*time.Millisecond), withLaunchPoll(1*time.Millisecond))

	err := adapter.EnsureOnline(context.Background(), "MyPC", false)
	if !errors.Is(err, ErrDeviceOffline) {
		t.Fatalf("expected ErrDeviceOffline when device absent from ListDevices, got: %v", err)
	}
}

func TestEnsureOnlineLaunchesAndPollsUntilDeviceRegistersWithinTimeout(t *testing.T) {
	t.Parallel()

	fake := &fakeJdClient{
		devices: []jd.DeviceInfo{}, // starts empty
	}
	launched := false
	pollCount := 0
	adapter := newWithClient(fake,
		withLaunchTimeout(50*time.Millisecond),
		withLaunchPoll(5*time.Millisecond),
		withLauncher(func() error {
			launched = true
			return nil
		}),
	)
	// After 2 polls, the device "registers".
	adapter.testHookBeforeListDevices = func() {
		pollCount++
		if pollCount >= 2 {
			fake.devices = []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}}
		}
	}

	if err := adapter.EnsureOnline(context.Background(), "MyPC", true); err != nil {
		t.Fatalf("expected EnsureOnline to succeed after auto-launch poll, got: %v", err)
	}
	if !launched {
		t.Fatal("expected the launcher to have been invoked")
	}
}

func TestEnsureOnlineReturnsErrDeviceOfflineWhenAutoLaunchPollTimesOut(t *testing.T) {
	t.Parallel()

	fake := &fakeJdClient{devices: []jd.DeviceInfo{}}
	adapter := newWithClient(fake,
		withLaunchTimeout(20*time.Millisecond),
		withLaunchPoll(5*time.Millisecond),
		withLauncher(func() error { return nil }),
	)

	err := adapter.EnsureOnline(context.Background(), "MyPC", true)
	if !errors.Is(err, ErrDeviceOffline) {
		t.Fatalf("expected ErrDeviceOffline on auto-launch poll timeout, got: %v", err)
	}
}

func TestEnsureOnlineReturnsErrorWhenConnectFails(t *testing.T) {
	t.Parallel()

	fake := &fakeJdClient{connectErr: errors.New("network down")}
	adapter := newWithClient(fake)

	err := adapter.EnsureOnline(context.Background(), "MyPC", false)
	if err == nil {
		t.Fatal("expected an error when Connect fails")
	}
}

// --- AddAndStart with no package name (4.7) ---

func TestAddAndStartNeverSetsAPackageName(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{}
	device := &fakeDevice{lg: lg, dl: &fakeDownloader{}}
	fake := &fakeJdClient{
		devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}},
		device:  device,
	}
	adapter := newWithClient(fake)

	err := adapter.AddAndStart(context.Background(), "MyPC", EnqueueRequest{
		URLs:        []string{"https://example.com/file.mp4"},
		Destination: "C:/anime/Show",
	})
	if err != nil {
		t.Fatalf("AddAndStart: %v", err)
	}

	if len(lg.capturedLinks) != 1 || lg.capturedLinks[0] != "https://example.com/file.mp4" {
		t.Fatalf("unexpected captured links: %v", lg.capturedLinks)
	}

	params := &jd.AddLinksParams{}
	for _, opt := range lg.capturedOpts {
		opt(params)
	}
	if params.PackageName != nil {
		t.Fatalf("expected PackageName to be nil (never set), got %q", *params.PackageName)
	}
	if params.Autostart == nil || !*params.Autostart {
		t.Fatal("expected Autostart to be true")
	}
	if params.DestinationFolder == nil || *params.DestinationFolder != "C:/anime/Show" {
		t.Fatalf("expected DestinationFolder to be set, got %v", params.DestinationFolder)
	}
}

func TestAddAndStartReturnsErrorOnLinkGrabberFailure(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{addErr: errors.New("hoster rejected")}
	device := &fakeDevice{lg: lg, dl: &fakeDownloader{}}
	fake := &fakeJdClient{
		devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}},
		device:  device,
	}
	adapter := newWithClient(fake)

	err := adapter.AddAndStart(context.Background(), "MyPC", EnqueueRequest{URLs: []string{"https://example.com/file.mp4"}})
	if err == nil {
		t.Fatal("expected an error when the link grabber Add call fails")
	}
}

var _ = (*fakeDevice)(nil) // ensures the fake stays compiled even if a test above is skipped

// JD ships an ENABLED packagizer rule "Create Subfolder by Packagename" whose
// downloadDestination is <jd:packagename>, so without overwritePackagizerRules every add
// lands in a subfolder of the requested folder instead of the folder itself. Bridge owns
// the exact layout (anime folder, flat, one episode per file), so the rules must not apply.
func TestAddAndStartTellsJDToIgnorePackagizerRules(t *testing.T) {
	t.Parallel()

	lg := &fakeLinkGrabber{}
	fake := &fakeJdClient{
		devices: []jd.DeviceInfo{{Name: "MyPC", Status: "ONLINE"}},
		device:  &fakeDevice{lg: lg, dl: &fakeDownloader{}},
	}
	adapter := newWithClient(fake)

	err := adapter.AddAndStart(context.Background(), "MyPC", EnqueueRequest{
		URLs:        []string{"http://mediafire.example/1"},
		Destination: `D:\Anime\Bleach`,
	})
	if err != nil {
		t.Fatalf("AddAndStart: %v", err)
	}

	params := &jd.AddLinksParams{}
	for _, opt := range lg.capturedOpts {
		opt(params)
	}
	if params.OverwritePackagizerRules == nil || !*params.OverwritePackagizerRules {
		t.Fatalf("expected overwritePackagizerRules=true so JD keeps the exact destination, got %v", params.OverwritePackagizerRules)
	}
	if params.DestinationFolder == nil || *params.DestinationFolder != `D:\Anime\Bleach` {
		t.Fatalf("destination = %v, want the anime folder verbatim", params.DestinationFolder)
	}
}
