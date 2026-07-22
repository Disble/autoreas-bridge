package sync

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// vocabularyRenameMap is the user-approved Legacy-Spanish -> English rename
// map (SDD-56, memory #5855). It is applied at every JSON nesting depth
// (top-level snapshot fields, days[] entries, repetitions[] entries) since
// the same Spanish key names are reused inside those nested arrays.
var vocabularyRenameMap = map[string]string{
	"_id":              "id",
	"nombre":           "name",
	"nrocapvisto":      "episodesWatched",
	"estado":           "status",
	"activo":           "active",
	"primeravez":       "firstCycle",
	"dias":             "days",
	"dia":              "day",
	"orden":            "order",
	"fechaCreacion":    "createdAt",
	"fechaEstreno":     "premieredAt",
	"fechaUltCapVisto": "lastWatchedAt",
	"fechaEliminacion": "deletedAt",
	"totalcap":         "totalEpisodes",
	"duracion":         "durationMinutes",
	"tipo":             "kind",
	"pagina":           "sourceUrl",
	"carpeta":          "folder",
	"origen":           "origin",
	"estudios":         "studios",
	"generos":          "genres",
	"portada":          "cover",
	"repetir":          "repetitions",
	"numrepeticion":    "numRepetitions",
	"fechaRepeticion":  "repeatedAt",
}

// migrateVocabularyJSON is the temporary, private legacy-Spanish decoder
// (SDD-56). It is reachable only from this migration file -- no live
// REST/WS/sync path imports it -- and rewrites Spanish keys to their English
// equivalents at every nesting depth, flattening the NeDB `{"$$date": n}`
// wrapper to a plain epoch-millis number in the same pass. It is a pure key
// rename plus wrapper unwrap: no value is dropped, truncated, or
// reinterpreted. json.Number is used throughout (via UseNumber) so numeric
// literals are re-emitted byte-identical, with no float64 rounding risk.
//
// It returns the rewritten payload and whether any Spanish key or $$date
// wrapper was actually found and rewritten. changed == false
// means the payload was already fully English (for example a row written by
// the live codec after this migration already ran once): the caller then
// leaves the original bytes and hash completely untouched instead of
// churning them through an equivalent-but-differently-ordered re-encode.
func migrateVocabularyJSON(payload []byte) (rewritten []byte, changed bool, err error) {
	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.UseNumber()
	var decoded any
	if err := dec.Decode(&decoded); err != nil {
		return nil, false, fmt.Errorf("decode vocabulary migration payload: %w", err)
	}
	transformed, changed := transformVocabularyNode(decoded)
	if !changed {
		return payload, false, nil
	}
	encoded, err := json.Marshal(transformed)
	if err != nil {
		return nil, false, fmt.Errorf("encode vocabulary migration payload: %w", err)
	}
	return encoded, true, nil
}

// transformVocabularyNode recursively renames Spanish keys to English and
// flattens any `{"$$date": n}` wrapper node to its plain numeric value,
// reporting whether it changed anything.
func transformVocabularyNode(node any) (any, bool) {
	switch value := node.(type) {
	case map[string]any:
		return transformVocabularyObject(value)
	case []any:
		return transformVocabularyArray(value)
	default:
		return value, false
	}
}

// transformVocabularyObject renames Spanish keys on one JSON object node, or
// flattens it entirely when it is exactly a `{"$$date": n}` wrapper.
func transformVocabularyObject(value map[string]any) (any, bool) {
	if len(value) == 1 {
		if dateValue, ok := value["$$date"]; ok {
			return dateValue, true
		}
	}
	changed := false
	result := make(map[string]any, len(value))
	for key, child := range value {
		renamedKey := key
		if renamed, ok := vocabularyRenameMap[key]; ok {
			renamedKey = renamed
			changed = true
		}
		transformedChild, childChanged := transformVocabularyNode(child)
		changed = changed || childChanged
		result[renamedKey] = transformedChild
	}
	return result, changed
}

// transformVocabularyArray renames Spanish keys on every element of one JSON
// array node (used for the days[] and repetitions[] entries).
func transformVocabularyArray(value []any) (any, bool) {
	changed := false
	result := make([]any, len(value))
	for index, item := range value {
		transformedItem, itemChanged := transformVocabularyNode(item)
		changed = changed || itemChanged
		result[index] = transformedItem
	}
	return result, changed
}
