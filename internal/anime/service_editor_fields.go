package anime

import (
	"encoding/json"

	"autoreas-bridge/internal/api/contracts"
)

// decodeSnapshotFields decodes the fields from a snapshot payload.
func decodeSnapshotFields(payload []byte) map[string]json.RawMessage {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return map[string]json.RawMessage{}
	}
	return fields
}

// cloneMobileDays copies mobile anime day placements.
func cloneMobileDays(days []contracts.MobileAnimeDay) []contracts.MobileAnimeDay {
	return append([]contracts.MobileAnimeDay{}, days...)
}

// editorStringListFromFields reads a string-list editor field.
func editorStringListFromFields(fields map[string]json.RawMessage, key string) contracts.AnimeEditorStringListDTO {
	value, exists := fields[key]
	if !exists {
		return contracts.AnimeEditorStringListDTO{Kind: contracts.AnimeEditorValueKindMissing, Values: []string{}}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorStringListDTO{Kind: contracts.AnimeEditorValueKindNull, Values: []string{}}
	}
	var values []string
	if err := json.Unmarshal(value, &values); err == nil {
		return contracts.AnimeEditorStringListDTO{Kind: contracts.AnimeEditorValueKindValue, Values: append([]string{}, values...)}
	}
	return contracts.AnimeEditorStringListDTO{Kind: contracts.AnimeEditorValueKindMissing, Values: []string{}}
}

// editorNullableStringFromFields reads a nullable string editor field.
func editorNullableStringFromFields(fields map[string]json.RawMessage, key string) contracts.AnimeEditorNullableStringDTO {
	value, exists := fields[key]
	if !exists {
		return contracts.AnimeEditorNullableStringDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorNullableStringDTO{Kind: contracts.AnimeEditorValueKindNull}
	}
	var decoded string
	if json.Unmarshal(value, &decoded) != nil {
		return contracts.AnimeEditorNullableStringDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	return contracts.AnimeEditorNullableStringDTO{Kind: contracts.AnimeEditorValueKindValue, Value: decoded}
}

// editorNullableIntFromFields reads a nullable integer editor field.
func editorNullableIntFromFields(fields map[string]json.RawMessage, key string) contracts.AnimeEditorNullableIntDTO {
	value, exists := fields[key]
	if !exists {
		return contracts.AnimeEditorNullableIntDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorNullableIntDTO{Kind: contracts.AnimeEditorValueKindNull}
	}
	var decoded int
	if json.Unmarshal(value, &decoded) != nil {
		return contracts.AnimeEditorNullableIntDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	return contracts.AnimeEditorNullableIntDTO{Kind: contracts.AnimeEditorValueKindValue, Value: decoded}
}

// editorNullableTimeFromFields reads a nullable time editor field.
func editorNullableTimeFromFields(fields map[string]json.RawMessage, key string) contracts.AnimeEditorNullableTimeDTO {
	value, exists := fields[key]
	if !exists {
		return contracts.AnimeEditorNullableTimeDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorNullableTimeDTO{Kind: contracts.AnimeEditorValueKindNull}
	}
	var wrapper struct {
		UnixMilli int64 `json:"$$date"`
	}
	if json.Unmarshal(value, &wrapper) != nil {
		return contracts.AnimeEditorNullableTimeDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	return contracts.AnimeEditorNullableTimeDTO{Kind: contracts.AnimeEditorValueKindValue, UnixMilli: wrapper.UnixMilli}
}

// editorCoverFromFields reads cover data from snapshot fields.
func editorCoverFromFields(fields map[string]json.RawMessage) contracts.AnimeEditorCoverDTO {
	value, exists := fields["portada"]
	if !exists {
		return contracts.AnimeEditorCoverDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	if string(value) == "null" {
		return contracts.AnimeEditorCoverDTO{Kind: contracts.AnimeEditorValueKindNull}
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(value, &raw); err != nil {
		return contracts.AnimeEditorCoverDTO{Kind: contracts.AnimeEditorValueKindMissing}
	}
	result := contracts.AnimeEditorCoverDTO{Kind: contracts.AnimeEditorValueKindValue, Raw: map[string]any{}}
	if path, ok := raw["path"]; ok {
		_ = json.Unmarshal(path, &result.Path)
	}
	if coverType, ok := raw["type"]; ok {
		_ = json.Unmarshal(coverType, &result.Type)
	}
	for key, rawValue := range raw {
		if key == "type" || key == "path" {
			continue
		}
		var decoded any
		if err := json.Unmarshal(rawValue, &decoded); err != nil {
			continue
		}
		result.Raw[key] = decoded
	}
	if len(result.Raw) == 0 {
		result.Raw = nil
	}
	return result
}
