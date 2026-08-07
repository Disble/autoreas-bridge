package jdownloader

import (
	"context"
	"errors"
	"fmt"
	"time"

	jd "github.com/Disble/jdownloader-go/jdownloader"

	"autoreas-bridge/internal/download/config"
)

// ErrDeviceOffline is returned by EnsureOnline when the configured device name is absent from
// ListDevices -- the only valid liveness proof (design §3.3; PoC #12 quirk: Connect() succeeding
// does NOT mean the device is online).
var ErrDeviceOffline = errors.New("jdownloader: device offline")

// myJDAdapter implements JDClient on top of the real github.com/Disble/jdownloader-go client.
type myJDAdapter struct {
	client jd.JdClient

	launchTimeout time.Duration
	launchPoll    time.Duration
	launcher      func() error

	// testHookBeforeListDevices is a test-only seam invoked immediately before each ListDevices
	// poll iteration, letting tests simulate the device "registering" mid-poll. Nil in production.
	testHookBeforeListDevices func()
}

// Option configures a myJDAdapter at construction time.
type Option func(*myJDAdapter)

// withLaunchTimeout configures the launcher startup timeout.
func withLaunchTimeout(d time.Duration) Option {
	return func(a *myJDAdapter) { a.launchTimeout = d }
}

// withLaunchPoll configures the launcher readiness polling interval.
func withLaunchPoll(d time.Duration) Option {
	return func(a *myJDAdapter) { a.launchPoll = d }
}

// withLauncher configures the launcher implementation.
func withLauncher(fn func() error) Option {
	return func(a *myJDAdapter) { a.launcher = fn }
}

// newWithClient is the test/production-shared constructor: it accepts any jd.JdClient
// (production: the real MyJDownloader client; tests: a fake implementing the same interface).
func newWithClient(client jd.JdClient, opts ...Option) *myJDAdapter {
	a := &myJDAdapter{
		client:        client,
		launchTimeout: config.JDAutoLaunchPollTimeout,
		launchPoll:    config.FilesystemCompletionPollInterval,
	}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

// New returns a production JDClient wrapping the real MyJDownloader client. The exe launcher is
// supplied by the caller (Phase 6 wiring resolves it via launcher.go's ResolveExePath).
func New(client jd.JdClient, launcher func() error) JDClient {
	return newWithClient(client, withLauncher(launcher))
}

func (a *myJDAdapter) Connect(ctx context.Context) error {
	if err := a.client.Connect(); err != nil {
		return fmt.Errorf("jdownloader: connect: %w", err)
	}
	return nil
}

// ListDevices is the ONLY liveness proof (design §3.3 PoC #12 quirk).
func (a *myJDAdapter) ListDevices(ctx context.Context) ([]DeviceStatus, error) {
	devices, err := a.client.ListDevices()
	if err != nil {
		return nil, fmt.Errorf("jdownloader: list devices: %w", err)
	}
	out := make([]DeviceStatus, 0, len(*devices))
	for _, d := range *devices {
		out = append(out, DeviceStatus{Name: d.Name, Online: d.Status == "ONLINE"})
	}
	return out, nil
}

// EnsureOnline connects, then checks ListDevices for deviceName. Connect() succeeding is NOT
// sufficient proof of liveness -- only finding deviceName in ListDevices counts. If the device is
// absent and launchIfMissing is true, the configured launcher is invoked once and ListDevices is
// polled at a, launchPoll interval up to a.launchTimeout (design config.JDAutoLaunchPollTimeout).
func (a *myJDAdapter) EnsureOnline(ctx context.Context, deviceName string, launchIfMissing bool) error {
	if err := a.Connect(ctx); err != nil {
		return err
	}

	if a.deviceOnline(deviceName) {
		return nil
	}

	if !launchIfMissing {
		return fmt.Errorf("%w: %s", ErrDeviceOffline, deviceName)
	}

	if a.launcher != nil {
		if err := a.launcher(); err != nil {
			return fmt.Errorf("jdownloader: launch JD: %w", err)
		}
	}

	deadline := time.Now().Add(a.launchTimeout)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(a.launchPoll):
		}

		if a.testHookBeforeListDevices != nil {
			a.testHookBeforeListDevices()
		}

		if a.deviceOnline(deviceName) {
			return nil
		}
	}

	return fmt.Errorf("%w: %s (auto-launch poll timed out after %s)", ErrDeviceOffline, deviceName, a.launchTimeout)
}

// deviceOnline reports whether the named MyJDownloader device is reachable.
func (a *myJDAdapter) deviceOnline(deviceName string) bool {
	devices, err := a.client.ListDevices()
	if err != nil {
		return false
	}
	for _, d := range *devices {
		if d.Name == deviceName {
			return true
		}
	}
	return false
}

// AddAndStart enqueues req.URLs on deviceName with autostart, deliberately WITHOUT a package
// name (PoC #13 quirk -- an unset package name avoids JD creating a per-package destination
// subfolder; filesystem.Flatten exists to mop up any subfolder JD still creates regardless).
func (a *myJDAdapter) AddAndStart(ctx context.Context, deviceName string, req EnqueueRequest) error {
	device, err := a.client.Device(deviceName)
	if err != nil {
		return fmt.Errorf("jdownloader: get device %s: %w", deviceName, err)
	}

	// overwritePackagizerRules stops JD's packagizer rewriting the destination. The stock,
	// enabled "Create Subfolder by Packagename" rule sets downloadDestination to
	// <jd:packagename>, which turns the requested anime folder into a subfolder of itself --
	// breaking SaveTo correlation and leaving episodes under their hoster names.
	opts := []jd.AddLinksOptions{
		jd.AddLinksOptionAutostart(true),
		jd.AddLinksOptionOverwritePackagizerRules(true),
	}
	if req.Destination != "" {
		opts = append(opts, jd.AddLinksOptionDestinationDir(req.Destination))
	}
	// PackageName is intentionally never set -- see EnqueueRequest doc.

	if _, err := device.LinkGrabber().Add(req.URLs, opts...); err != nil {
		return fmt.Errorf("jdownloader: add links: %w", err)
	}
	return nil
}

func (a *myJDAdapter) Disconnect(ctx context.Context) error {
	if err := a.client.Disconnect(); err != nil {
		return fmt.Errorf("jdownloader: disconnect: %w", err)
	}
	return nil
}

var _ JDClient = (*myJDAdapter)(nil)
