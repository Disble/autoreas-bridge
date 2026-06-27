package anime

import (
	"context"
	"fmt"
	"io"
	"sync/atomic"

	"autoreas-bridge/internal/api/contracts"
	sharedlogger "autoreas-bridge/internal/logger"
)

type LegacyPullService interface {
	Pull(ctx context.Context) contracts.AnimeLegacyPullResult
}

type LegacyPullServiceConfig struct {
	FilePath     string
	Parser       SnapshotParser
	Store        SnapshotStore
	Publisher    EventPublisher
	Logger       WarningLogger
	SharedLogger sharedlogger.Logger
	OpenFile     func(path string) (io.ReadCloser, error)
}

type legacyPullService struct {
	filePath     string
	parser       SnapshotParser
	store        SnapshotStore
	publisher    EventPublisher
	logger       WarningLogger
	sharedLogger sharedlogger.Logger
	openFile     func(path string) (io.ReadCloser, error)
	running      atomic.Bool
}

func NewLegacyPullService(config LegacyPullServiceConfig) LegacyPullService {
	service := &legacyPullService{
		filePath:     config.FilePath,
		parser:       config.Parser,
		store:        config.Store,
		publisher:    config.Publisher,
		logger:       config.Logger,
		sharedLogger: config.SharedLogger,
		openFile:     config.OpenFile,
	}
	if service.openFile == nil {
		service.openFile = defaultOpenFile
	}
	return service
}

func (s *legacyPullService) Pull(ctx context.Context) contracts.AnimeLegacyPullResult {
	if !s.running.CompareAndSwap(false, true) {
		return contracts.AnimeLegacyPullResult{
			Status:  "in_progress",
			Message: "Pull from legacy is already in progress.",
		}
	}
	defer s.running.Store(false)

	result, err := runSnapshotPullPipeline(ctx, snapshotPullPipelineConfig{
		filePath:     s.filePath,
		parser:       s.parser,
		store:        s.store,
		publisher:    s.publisher,
		logger:       s.logger,
		sharedLogger: s.sharedLogger,
		openFile:     s.openFile,
		eventType:    "anime.manual_pull",
		logPrefix:    "manual legacy pull",
	})
	if err != nil {
		return contracts.AnimeLegacyPullResult{
			Status:  "error",
			Message: fmt.Sprintf("Pull from legacy failed: %v", err),
		}
	}

	return contracts.AnimeLegacyPullResult{
		Status:       "ok",
		Message:      fmt.Sprintf("Pulled %d updates from legacy.", result.updatedCount),
		UpdatedCount: result.updatedCount,
		PrunedCount:  result.prunedCount,
		WarningCount: result.warningCount,
	}
}
