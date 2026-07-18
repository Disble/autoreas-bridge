package tray

// MockTrayManager is an in-memory tray Manager test double.
type MockTrayManager struct {
	StartCalls  int
	StopCalls   int
	StartErr    error
	StopErr     error
	StartConfig Config
	Started     bool
	Stopped     bool
}

// Start records a tray start request.
func (m *MockTrayManager) Start(config Config) error {
	m.StartCalls++
	m.Started = true
	m.StartConfig = config
	return m.StartErr
}

// Stop records a tray stop request.
func (m *MockTrayManager) Stop() error {
	m.StopCalls++
	m.Stopped = true
	return m.StopErr
}
