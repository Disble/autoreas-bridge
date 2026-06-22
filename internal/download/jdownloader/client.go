// Package jdownloader implements the JDClient port (design.md §3.3, PoC #12/#13) on top of
// github.com/rkosegi/jdownloader-go. Connect() succeeding does NOT prove JD is online -- only
// ListDevices() finding the configured device name is a valid liveness proof (the PoC #12
// quirk this design calls out explicitly). AddAndStart NEVER sets a package name so JD does not
// create a per-package subfolder (PoC #13; filesystem.Flatten exists to mop up any subfolder
// JD still creates on its own).
package jdownloader

import "context"

// DeviceStatus is the liveness-checked view of a single MyJDownloader device (design §3.3).
type DeviceStatus struct {
	Name   string
	Online bool
}

// EnqueueRequest is the input to AddAndStart. PackageName is intentionally ABSENT from this
// struct -- it must never be set, because an empty package name avoids JD creating a per-package
// destination subfolder (PoC #13 quirk; design §3.3).
type EnqueueRequest struct {
	URLs        []string
	Destination string // per-anime Carpeta; "" lets the JD adapter's configured default apply.
}

// JDClient is the port the download orchestrator depends on (design.md §3.3). ListDevices is
// the ONLY liveness proof: Connect() can succeed while the configured device is offline.
type JDClient interface {
	Connect(ctx context.Context) error
	// ListDevices is the ONLY liveness proof for a specific device (Connect succeeding is NOT
	// sufficient -- design §3.3 PoC #12 quirk).
	ListDevices(ctx context.Context) ([]DeviceStatus, error)
	// EnsureOnline connects, checks ListDevices for deviceName, and -- if absent and
	// launchIfMissing is true -- launches the configured executable and polls ListDevices up to
	// the auto-launch timeout (design config.JDAutoLaunchPollTimeout, 90s).
	EnsureOnline(ctx context.Context, deviceName string, launchIfMissing bool) error
	// AddAndStart enqueues req.URLs on deviceName with autostart, and deliberately WITHOUT a
	// package name (PoC #13 quirk -- see EnqueueRequest doc).
	AddAndStart(ctx context.Context, deviceName string, req EnqueueRequest) error
	PackagesFinished(ctx context.Context, deviceName string) (bool, error)
	Disconnect(ctx context.Context) error
}
