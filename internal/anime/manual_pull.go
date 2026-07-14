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
	// Ownership is the SDD-48 (ADR-48-2) Bridge-native ownership registry,
	// threaded into the manual pull's DiffSnapshots call. Nil is safe
	// (rollback lever): it reproduces pre-SDD-48 behavior.
	Ownership BridgeNativeRegistry
}

type legacyPullService struct {
	filePath     string
	parser       SnapshotParser
	store        SnapshotStore
	publisher    EventPublisher
	logger       WarningLogger
	sharedLogger sharedlogger.Logger
	openFile     func(path string) (io.ReadCloser, error)
	ownership    BridgeNativeRegistry
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
		ownership:    config.Ownership,
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
		ownership:    s.ownership,
	})
	if err != nil {
		return contracts.AnimeLegacyPullResult{
			Status:  "error",
			Message: fmt.Sprintf("Pull from legacy failed: %v", err),
		}
	}

	return contracts.AnimeLegacyPullResult{
		Status:       "ok",
		Message:      buildLegacyPullMessage(result.updatedCount, result.prunedCount),
		UpdatedCount: result.updatedCount,
		PrunedCount:  result.prunedCount,
		WarningCount: result.warningCount,
	}
}

func buildLegacyPullMessage(updatedCount int, prunedCount int) string {
	if updatedCount == 0 && prunedCount == 0 {
		return "Bridge is already up to date with legacy."
	}

	parts := make([]string, 0, 2)
	if updatedCount > 0 {
		parts = append(parts, formatLegacyPullCount(updatedCount, "update"))
	}
	if prunedCount > 0 {
		parts = append(parts, formatLegacyPullCount(prunedCount, "removal"))
	}

	if len(parts) == 1 {
		return fmt.Sprintf("Pulled %s from legacy.", parts[0])
	}

	return fmt.Sprintf("Pulled %s and %s from legacy.", parts[0], parts[1])
}

func formatLegacyPullCount(count int, noun string) string {
	if count == 1 {
		return fmt.Sprintf("1 %s", noun)
	}

	return fmt.Sprintf("%d %ss", count, noun)
}
