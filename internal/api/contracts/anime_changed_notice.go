package contracts

// AnimeChangedNotice is the slim wire shape the desktop frontend receives on
// the `anime.changed` Wails runtime event. It deliberately omits the domain
// event's raw snapshot Payload: the UI only needs to know which anime changed
// so it can re-fetch its own read model, and shipping the full snapshot on
// every write would push a base64 blob through the WebView bridge for nothing.
type AnimeChangedNotice struct {
	AnimeID       string   `json:"animeId"`
	ChangeType    string   `json:"changeType"`
	ChangedFields []string `json:"changedFields"`
	CorrelationID string   `json:"correlationId"`
}
