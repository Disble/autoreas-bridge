package tray

import "sync"

type menuItem interface {
	Clicked() <-chan struct{}
}

// The tray's platform surface, held as swappable package vars rather than
// behind a build-tagged interface. systray_bindings_windows_cgo.go
// (//go:build windows && cgo) overwrites every one of these in init() with the
// real getlantern/systray calls, and systray_manager_test.go swaps in fakes.
//
// The no-op defaults below are therefore not placeholders: they ARE the port
// for a platform with no tray. On Linux, macOS, or Windows built without cgo
// the bindings file does not compile in, these run instead, and the tray
// quietly does nothing rather than the package failing to build.
//
// Do not "finish" them and do not delete them. Removing them leaves nil
// function values, which turns the first tray call on a non-Windows build
// into a panic. The mirror-image risk -- a Windows build that silently ships
// this no-op tray -- is guarded in CI, where
// .github/workflows/build-windows.yml reads back go list -f '{{.GoFiles}}'
// and fails the job when the bindings file is absent. Nothing guards this
// block itself.
var (
	runWithExternalLoop func(onReady, onExit func()) = func(onReady, _ func()) {
		go onReady()
	}
	setIcon     func([]byte)                  = func([]byte) { /* no tray on this build */ }
	setTooltip  func(string)                  = func(string) { /* no tray on this build */ }
	addMenuItem func(string, string) menuItem = func(string, string) menuItem { return nil }
	quit        func()                        = func() { /* no tray on this build */ }
)

// SystrayManager implements Manager with the native system tray.
type SystrayManager struct {
	mu       sync.Mutex
	stopOnce sync.Once
	started  bool
}

// NewSystrayManager creates a native system-tray manager.
func NewSystrayManager() *SystrayManager {
	return &SystrayManager{}
}

// Start initializes the native system tray.
func (m *SystrayManager) Start(config Config) error {
	m.mu.Lock()
	m.started = true
	m.stopOnce = sync.Once{}
	m.mu.Unlock()

	runWithExternalLoop(func() {
		setIcon(config.Icon)
		if config.Tooltip != "" {
			setTooltip(config.Tooltip)
		}

		openItem := addMenuItem("Abrir", "Abrir la ventana principal")
		exitItem := addMenuItem("Salir", "Salir de Autoreas Bridge")

		go listenMenuItem(openItem, config.OnOpen)
		go listenMenuItem(exitItem, config.OnExit)
	}, func() { /* nothing to unwind on exit: Stop drives quit itself */ })

	return nil
}

// Stop requests termination of the native system tray.
func (m *SystrayManager) Stop() error {
	m.mu.Lock()
	started := m.started
	m.mu.Unlock()
	if !started {
		return nil
	}

	m.stopOnce.Do(func() {
		quit()
	})

	return nil
}

// listenMenuItem invokes a callback for each native menu-item click.
func listenMenuItem(item menuItem, callback func()) {
	if item == nil || callback == nil {
		return
	}

	for range item.Clicked() {
		callback()
	}
}
