package api

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"
	"sync"

	"autoreas-bridge/internal/api/contracts"
	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/device"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
)

// AnimePatch aliases the API patch contract consumed by transport adapters.
type AnimePatch = contracts.AnimePatch

// AnimeCreate aliases the API create contract consumed by transport adapters.
type AnimeCreate = contracts.AnimeCreate

// Placement aliases the API schedule-placement contract used by creates.
type Placement = contracts.Placement

// AnimeCreateCover aliases the API create-cover contract used by creates.
type AnimeCreateCover = contracts.AnimeCreateCover

// AnimeCreateResult aliases the API create-result contract consumed by transport adapters.
type AnimeCreateResult = contracts.AnimeCreateResult

// EffectiveAnime aliases the effective anime read model exposed by query services.
type EffectiveAnime = contracts.EffectiveAnime

// AnimeQueryService aliases the query-side API contract.
type AnimeQueryService = contracts.AnimeQueryService

// AnimeWriteService aliases the write-side API contract.
type AnimeWriteService = contracts.AnimeWriteService

// SyncTriggerService aliases the sync-trigger API contract.
type SyncTriggerService = contracts.SyncTriggerService

// StatusService aliases the status-query API contract.
type StatusService = contracts.StatusService

// DeviceAdminService aliases the device-admin API contract.
type DeviceAdminService = contracts.DeviceAdminService

// ConflictService aliases the conflict-management API contract.
type ConflictService = contracts.ConflictService

// RecordSeasonRatingFunc aliases the season-rating command handler signature.
type RecordSeasonRatingFunc = apiHandlers.RecordSeasonRatingFunc

// ActiveSeasonSnapshotFunc aliases the active-season snapshot query signature.
type ActiveSeasonSnapshotFunc = apiHandlers.ActiveSeasonSnapshotFunc

// CaptureFunc aliases the request-capture queue seam.
type CaptureFunc = apiHandlers.CaptureFunc

// ErrAnimeNotFound reports that the requested anime does not exist.
var ErrAnimeNotFound = contracts.ErrAnimeNotFound

// Config wires the services and runtime dependencies used by the HTTP API.
type Config struct {
	Addr                   string
	DeviceService          device.AuthService
	AnimeQuery             AnimeQueryService
	AnimeWrite             AnimeWriteService
	SyncTrigger            SyncTriggerService
	Status                 StatusService
	DeviceAdmin            DeviceAdminService
	Conflicts              ConflictService
	RecordSeasonRating     RecordSeasonRatingFunc
	ActiveSeasonSnapshot   ActiveSeasonSnapshotFunc
	RealtimeHub            realtime.Hub
	Logger                 sharedlogger.Logger
	OnPairingTokenConsumed func()
	Capture                CaptureFunc
}

// Server exposes the lifecycle of the bridge HTTP server.
type Server interface {
	Start() error
	Shutdown(ctx context.Context) error
	Addr() string
	EffectiveAddress() string
}

// HTTPServer hosts the bridge HTTP API over a net/http server.
type HTTPServer struct {
	addr                 string
	handler              http.Handler
	server               *http.Server
	listener             net.Listener
	serveMu              sync.Mutex
	resolveEffectiveHost func() (string, error)
	logger               sharedlogger.Logger
}

// NewServer builds a bridge HTTP server from the provided transport config.
func NewServer(config Config) Server {
	addr := config.Addr
	if addr == "" {
		addr = "0.0.0.0:8080"
	}

	handler := NewHandler(config)
	return &HTTPServer{
		addr:                 addr,
		handler:              handler,
		resolveEffectiveHost: resolveEffectiveHost,
		logger:               config.Logger,
	}
}

// Start begins serving the configured HTTP API listener.
func (s *HTTPServer) Start() error {
	s.serveMu.Lock()
	defer s.serveMu.Unlock()

	if s.listener != nil {
		return nil
	}

	listener, err := net.Listen("tcp", s.addr)
	if err != nil {
		return err
	}

	s.listener = listener
	server := &http.Server{Handler: s.handler}
	s.server = server
	if s.logger != nil {
		s.logger.Infof("api", "http server listening on %s", listener.Addr().String())
	}

	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return
		}
	}()

	return nil
}

// Shutdown stops the HTTP server and closes the active listener.
func (s *HTTPServer) Shutdown(ctx context.Context) error {
	s.serveMu.Lock()
	defer s.serveMu.Unlock()

	if s.server == nil {
		return nil
	}
	err := s.server.Shutdown(ctx)
	s.server = nil
	s.listener = nil
	return err
}

// Addr returns the listening address, using the bound listener when started.
func (s *HTTPServer) Addr() string {
	if s.listener != nil {
		return s.listener.Addr().String()
	}
	return s.addr
}

// EffectiveAddress returns the LAN-reachable address advertised to devices.
func (s *HTTPServer) EffectiveAddress() string {
	addr := s.Addr()
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}

	resolve := s.resolveEffectiveHost
	if resolve == nil {
		resolve = resolveEffectiveHost
	}

	effectiveHost, err := resolve()
	if err != nil || effectiveHost == "" {
		effectiveHost = host
	}

	if effectiveHost == "" {
		effectiveHost = "127.0.0.1"
	}

	if _, err := strconv.Atoi(port); err != nil {
		return net.JoinHostPort(effectiveHost, port)
	}

	return net.JoinHostPort(effectiveHost, port)
}

// outboundProbeAddress is an off-machine address used only to ask the OS routing
// table which local interface (and IP) would carry outbound traffic. No packets
// are sent to it.
const outboundProbeAddress = "8.8.8.8:80"

// resolveEffectiveHost returns the LAN IPv4 a device on the same network (e.g. the
// mobile app) can use to reach this bridge. It prefers the IP of the interface that
// carries the default route — the real Wi-Fi/Ethernet adapter — exactly the way the
// OS and other apps resolve "my network IP". It only scans interfaces as a fallback.
// This deliberately avoids virtual adapters (Hyper-V/WSL "Default Switch", Docker)
// which enumerate first but are unreachable from a phone.
func resolveEffectiveHost() (string, error) {
	return chooseEffectiveHost(preferredOutboundIP(net.Dial), resolveHostFromInterfaces)
}

// chooseEffectiveHost prefers the routed outbound IP and only falls back to an
// interface scan when no outbound route is available (e.g. the machine is offline).
func chooseEffectiveHost(outboundIP string, fallback func() (string, error)) (string, error) {
	if outboundIP != "" {
		return outboundIP, nil
	}
	return fallback()
}

// preferredOutboundIP asks the OS routing table which local IPv4 would be used to
// reach an off-machine address. The UDP socket only resolves the route; no packets
// are sent. Returns "" when offline or when the resolved address is not a usable IPv4.
func preferredOutboundIP(dial func(network, address string) (net.Conn, error)) string {
	conn, err := dial("udp", outboundProbeAddress)
	if err != nil {
		return ""
	}
	defer func() {
		_ = conn.Close() // A UDP route probe has no buffered output; close errors cannot affect the resolved address.
	}()

	udpAddr, ok := conn.LocalAddr().(*net.UDPAddr)
	if !ok || udpAddr.IP == nil {
		return ""
	}

	ipv4 := udpAddr.IP.To4()
	if ipv4 == nil || ipv4.IsLoopback() {
		return ""
	}

	return ipv4.String()
}

// resolveHostFromInterfaces scans network interfaces for the first active,
// non-loopback IPv4. Used only as a fallback when the routing probe is unavailable.
func resolveHostFromInterfaces() (string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "", err
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		if ipv4 := firstUsableIPv4(addrs); ipv4 != "" {
			return ipv4, nil
		}
	}

	return "", errors.New("no active non-loopback ipv4 address")
}

// firstUsableIPv4 returns the first non-loopback IPv4 address in the list.
func firstUsableIPv4(addrs []net.Addr) string {
	for _, addr := range addrs {
		ip := ipFromAddr(addr)
		if ip == nil || ip.IsLoopback() {
			continue
		}
		if ipv4 := ip.To4(); ipv4 != nil {
			return ipv4.String()
		}
	}
	return ""
}

// ipFromAddr extracts an IP value from the supported network address types.
func ipFromAddr(addr net.Addr) net.IP {
	switch value := addr.(type) {
	case *net.IPNet:
		return value.IP
	case *net.IPAddr:
		return value.IP
	default:
		return nil
	}
}
