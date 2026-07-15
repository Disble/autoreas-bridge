package legacy

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"autoreas-bridge/internal/api/contracts"
)

func (g *Gateway) Recover(ctx context.Context) error {
	if g.config.Operations == nil {
		return fmt.Errorf("Legacy write-base store is required")
	}
	operations, err := g.config.Operations.ListStaged(ctx)
	if err != nil {
		return err
	}
	for _, operation := range operations {
		effectiveHash, readErr := g.recoveryEffectiveHash(operation)
		if readErr != nil {
			return readErr
		}
		action, recoverErr := g.config.Operations.Recover(ctx, operation.OperationID, effectiveHash, g.config.Now().UnixMilli())
		if recoverErr != nil {
			return recoverErr
		}
		switch action {
		case WriteRecoveryActionFinalized:
			continue
		case WriteRecoveryActionRetryAppend:
			if err := g.append(ctx, operation.AnimeID, operation.DesiredSnapshotJSON); err != nil {
				return g.abortAfterDefiniteFailure(operation.OperationID, err)
			}
			if err := g.config.Operations.Finalize(ctx, operation.OperationID, g.config.Now().UnixMilli()); err != nil {
				return err
			}
		case WriteRecoveryActionDivergent:
			continue
		}
	}
	return nil
}

func (g *Gateway) recoveryEffectiveHash(operation WriteOperation) (string, error) {
	effective, err := readEffective(g.config.FilePath, operation.AnimeID)
	if err == nil {
		return hashSnapshot(effective), nil
	}
	if errors.Is(err, contracts.ErrAnimeNotFound) && isSyntheticMissingBase(operation) {
		return operation.BaseHash, nil
	}
	return "", fmt.Errorf("read effective Legacy anime %q: %w", operation.AnimeID, err)
}

func isSyntheticMissingBase(operation WriteOperation) bool {
	var base map[string]json.RawMessage
	if json.Unmarshal(operation.BaseSnapshotJSON, &base) != nil || len(base) != 1 {
		return false
	}
	var id string
	if json.Unmarshal(base["_id"], &id) != nil {
		return false
	}
	return id == operation.AnimeID
}

func readEffective(path, animeID string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	var effective []byte
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		var envelope struct {
			ID      string `json:"_id"`
			Deleted bool   `json:"$$deleted"`
		}
		if json.Unmarshal(line, &envelope) != nil || envelope.ID != animeID {
			continue
		}
		if envelope.Deleted {
			effective = nil
			continue
		}
		var raw LegacyAnimeRaw
		if err := json.Unmarshal(line, &raw); err != nil {
			return nil, err
		}
		effective, err = raw.MarshalJSON()
		if err != nil {
			return nil, err
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if effective == nil {
		return nil, contracts.ErrAnimeNotFound
	}
	return effective, nil
}
