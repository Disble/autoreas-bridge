package api

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"
	"sync"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
)

type AnimePatch = contracts.AnimePatch
type AnimeCreate = contracts.AnimeCreate
type EffectiveAnime = contracts.EffectiveAnime
type AnimeQueryService = contracts.AnimeQueryService
type AnimeWriteService = contracts.AnimeWriteService
type SyncTriggerService = contracts.SyncTriggerService
type StatusService = contracts.StatusService
type DeviceAdminService = contracts.DeviceAdminService
type ConflictService = contracts.ConflictService

var ErrAnimeNotFound = contracts.ErrAnimeNotFound

type Config struct {
	Addr                   string
	DeviceService          device.AuthService
	AnimeQuery             AnimeQueryService
	AnimeWrite             AnimeWriteService
	SyncTrigger            SyncTriggerService
	Status                 StatusService
	DeviceAdmin            DeviceAdminService
	Conflicts              ConflictService
	RealtimeHub            realtime.Hub
	Logger                 sharedlogger.Logger
	OnPairingTokenConsumed func()
}

type Server interface {
	Start() error
	Shutdown(ctx context.Context) error
	Addr() string
	EffectiveAddress() string
}

type HTTPServer struct {
	addr                 string
	handler              http.Handler
	server               *http.Server
	listener             net.Listener
	serveMu              sync.Mutex
	resolveEffectiveHost func() (string, error)
	logger               sharedlogger.Logger
}

func NewServer(config Config) Server {
	addr := config.Addr
	if addr == "" {
		addr = "0.0.0.0:8080"
	}

	handler := NewHandler(config)
	var wrappedHandler http.Handler = handler
	if config.Logger != nil {
		wrappedHandler = RequestLoggingMiddleware(handler, config.Logger)
	}
	return &HTTPServer{
		addr:                 addr,
		handler:              wrappedHandler,
		resolveEffectiveHost: resolveEffectiveHost,
		logger:               config.Logger,
	}
}

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

func (s *HTTPServer) Addr() string {
	if s.listener != nil {
		return s.listener.Addr().String()
	}
	return s.addr
}

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
	defer conn.Close()

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

		for _, addr := range addrs {
			var ip net.IP
			switch value := addr.(type) {
			case *net.IPNet:
				ip = value.IP
			case *net.IPAddr:
				ip = value.IP
			}

			if ip == nil || ip.IsLoopback() {
				continue
			}

			if ipv4 := ip.To4(); ipv4 != nil {
				return ipv4.String(), nil
			}
		}
	}

	return "", errors.New("no active non-loopback ipv4 address")
}
