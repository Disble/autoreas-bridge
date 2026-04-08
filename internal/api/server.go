package api

import (
	"context"
	"errors"
	"net"
	"net/http"
	"sync"

	"autoreas-bridge/internal/device"
)

type Config struct {
	Addr          string
	DeviceService device.AuthService
}

type Server interface {
	Start() error
	Shutdown(ctx context.Context) error
	Addr() string
}

type HTTPServer struct {
	addr     string
	handler  http.Handler
	server   *http.Server
	listener net.Listener
	serveMu  sync.Mutex
}

func NewServer(config Config) Server {
	addr := config.Addr
	if addr == "" {
		addr = "127.0.0.1:0"
	}

	handler := NewHandler(config)
	return &HTTPServer{
		addr:    addr,
		handler: handler,
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
	s.server = &http.Server{Handler: s.handler}

	go func() {
		if err := s.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
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
