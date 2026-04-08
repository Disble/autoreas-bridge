package tray

import "sync"

type menuItem interface {
	Clicked() <-chan struct{}
}

var (
	runWithExternalLoop func(onReady, onExit func()) = func(onReady, _ func()) {
		go onReady()
	}
	setIcon     func([]byte)                  = func([]byte) {}
	setTooltip  func(string)                  = func(string) {}
	addMenuItem func(string, string) menuItem = func(string, string) menuItem { return nil }
	quit        func()                        = func() {}
)

type SystrayManager struct {
	mu       sync.Mutex
	stopOnce sync.Once
	started  bool
}

func NewSystrayManager() *SystrayManager {
	return &SystrayManager{}
}

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
	}, func() {})

	return nil
}

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

func listenMenuItem(item menuItem, callback func()) {
	if item == nil || callback == nil {
		return
	}

	for range item.Clicked() {
		callback()
	}
}
