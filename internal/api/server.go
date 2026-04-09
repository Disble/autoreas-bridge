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
type EffectiveAnime = contracts.EffectiveAnime
type AnimeQueryService = contracts.AnimeQueryService
type AnimeWriteService = contracts.AnimeWriteService
type SyncTriggerService = contracts.SyncTriggerService
type StatusService = contracts.StatusService
type DeviceAdminService = contracts.DeviceAdminService
type ConflictService = contracts.ConflictService

var ErrAnimeNotFound = contracts.ErrAnimeNotFound

type Config struct {
	Addr          string
	DeviceService device.AuthService
	AnimeQuery    AnimeQueryService
	AnimeWrite    AnimeWriteService
	SyncTrigger   SyncTriggerService
	Status        StatusService
	DeviceAdmin   DeviceAdminService
	Conflicts     ConflictService
	RealtimeHub   realtime.Hub
	Logger        sharedlogger.Logger
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
	return &HTTPServer{
		addr:                 addr,
		handler:              handler,
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

func resolveEffectiveHost() (string, error) {
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
