package tray

type Config struct {
	Icon    []byte
	Tooltip string
	OnOpen  func()
	OnExit  func()
}

type TrayManager interface {
	Start(Config) error
	Stop() error
}

const DefaultTooltip = "Autoreas Bridge"
