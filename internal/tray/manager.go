package tray

// Config configures system-tray startup.
type Config struct {
	Icon    []byte
	Tooltip string
	OnOpen  func()
	OnExit  func()
}

// Manager controls the system tray lifecycle.
type Manager interface {
	Start(Config) error
	Stop() error
}

// DefaultTooltip is the default text displayed by the system tray.
const DefaultTooltip = "Autoreas Bridge"
