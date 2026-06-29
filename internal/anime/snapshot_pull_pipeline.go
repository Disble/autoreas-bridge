package anime

import (
	"context"
	"fmt"
	"io"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
)

type snapshotPullPipelineConfig struct {
	filePath     string
	parser       SnapshotParser
	store        SnapshotStore
	publisher    EventPublisher
	logger       WarningLogger
	sharedLogger sharedlogger.Logger
	openFile     func(path string) (io.ReadCloser, error)
	eventType    string
	logPrefix    string
}

type snapshotPullPipelineResult struct {
	updatedCount int
	prunedCount  int
	warningCount int
}

func runSnapshotPullPipeline(ctx context.Context, config snapshotPullPipelineConfig) (snapshotPullPipelineResult, error) {
	log := newDomainLogger("anime", config.sharedLogger, config.logger)
	start := time.Now()
	log.Infof("starting %s for %s", config.logPrefix, config.filePath)

	baseline, err := config.store.ListSnapshots(ctx)
	if err != nil {
		log.Errorf("failed to read %s baseline snapshots: %v", config.logPrefix, err)
		return snapshotPullPipelineResult{}, fmt.Errorf("list baseline snapshots: %w", err)
	}

	current, warnings, err := parseSnapshotFile(config)
	if err != nil {
		log.Errorf("failed to parse %s file %s: %v", config.logPrefix, config.filePath, err)
		return snapshotPullPipelineResult{}, err
	}

	deltas, pruneIDs := DiffSnapshots(current, baseline)

	for _, warning := range warnings {
		if config.logger != nil {
			config.logger.Warnf("warning parsing %s line %d: %s", config.filePath, warning.Line, warning.Reason)
		}
		log.Warnf("warning parsing %s line %d: %s", config.filePath, warning.Line, warning.Reason)
	}

	for _, delta := range deltas {
		if ctx.Err() != nil {
			return snapshotPullPipelineResult{}, ctx.Err()
		}
		config.publisher.Publish(delta)
	}

	elapsed := time.Since(start)
	log.Logf(sharedlogger.LevelInfo, sharedlogger.Fields{
		EventType:  config.eventType,
		DurationMs: elapsed.Milliseconds(),
	}, "%s published %d deltas and %d prunes", config.logPrefix, len(deltas), len(pruneIDs))

	if err := config.store.ReplaceBaseline(ctx, current, pruneIDs); err != nil {
		log.Errorf("failed to replace %s baseline: %v", config.logPrefix, err)
		return snapshotPullPipelineResult{}, fmt.Errorf("replace baseline snapshots: %w", err)
	}

	return snapshotPullPipelineResult{
		updatedCount: len(deltas),
		prunedCount:  len(pruneIDs),
		warningCount: len(warnings),
	}, nil
}

func parseSnapshotFile(config snapshotPullPipelineConfig) (map[string]SnapshotRecord, []ParseWarning, error) {
	file, err := config.openFile(config.filePath)
	if err != nil {
		return nil, nil, fmt.Errorf("open anime data file %q: %w", config.filePath, err)
	}
	defer file.Close()

	current, warnings, err := config.parser.Parse(file)
	if err != nil {
		return nil, nil, fmt.Errorf("parse anime snapshots: %w", err)
	}

	return current, warnings, nil
}
