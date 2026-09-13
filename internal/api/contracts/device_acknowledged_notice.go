package contracts

// DeviceAcknowledgedNotice is the slim wire shape the desktop frontend
// receives on the `sync.device_acknowledged` Wails runtime event. It lets the
// Connected Devices panel refresh in place instead of only on mount.
type DeviceAcknowledgedNotice struct {
	DeviceID     string `json:"deviceId"`
	LastSeenAtMs int64  `json:"lastSeenAtMs"`
}
