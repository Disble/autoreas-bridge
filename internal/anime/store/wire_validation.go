package store

import (
	"encoding/json"
	"fmt"
)

var (
	nullableNumberKeys = []string{"status", "totalEpisodes", "durationMinutes", "kind", "order"}
	nullableBoolKeys   = []string{"active", "firstCycle"}
	nullableStringKeys = []string{"sourceUrl", "folder", "origin", "day"}
	nullableDateKeys   = []string{"premieredAt", "lastWatchedAt", "createdAt", "deletedAt"}
	nullableArrayKeys  = []string{"studios", "genres"}
	repetitionNumKeys  = []string{"numRepetitions", "episodesWatched", "status"}
	repetitionDateKeys = []string{"createdAt", "premieredAt", "lastWatchedAt", "deletedAt", "repeatedAt"}
)

// validateKnownFields validates all recognized fields.
func validateKnownFields(fields map[string]json.RawMessage) error {
	if err := validateFieldGroup(fields, nullableNumberKeys, validateNullableNumber); err != nil {
		return err
	}
	if err := validateFieldGroup(fields, nullableBoolKeys, validateNullableBool); err != nil {
		return err
	}
	if err := validateFieldGroup(fields, nullableStringKeys, validateNullableString); err != nil {
		return err
	}
	if err := validateFieldGroup(fields, nullableDateKeys, validateNullableDate); err != nil {
		return err
	}
	if err := validateFieldGroup(fields, nullableArrayKeys, validateNullableArray); err != nil {
		return err
	}
	if err := validateDays(fields); err != nil {
		return err
	}
	return validateRepetitions(fields)
}

// validateFieldGroup applies a field validator to each key in a group.
func validateFieldGroup(fields map[string]json.RawMessage, keys []string, validate func(map[string]json.RawMessage, string) error) error {
	for _, key := range keys {
		if err := validate(fields, key); err != nil {
			return err
		}
	}
	return nil
}

// validateNullableNumber validates an optional numeric field.
func validateNullableNumber(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var decoded float64
	if err := json.Unmarshal(value, &decoded); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

// validateNullableBool validates an optional boolean field.
func validateNullableBool(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var decoded bool
	if err := json.Unmarshal(value, &decoded); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

// validateNullableString validates an optional string field.
func validateNullableString(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var decoded string
	if err := json.Unmarshal(value, &decoded); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

// validateNullableDate validates an optional plain epoch-millis date field.
func validateNullableDate(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var date int64
	if err := json.Unmarshal(value, &date); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

// validateNullableArray validates an optional array field.
func validateNullableArray(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var empty string
	if err := json.Unmarshal(value, &empty); err == nil && empty == "" {
		return nil
	}
	var decoded []json.RawMessage
	if err := json.Unmarshal(value, &decoded); err != nil {
		return fmt.Errorf("unmarshal %s: %w", key, err)
	}
	return nil
}

// validateDays validates the schedule days array.
func validateDays(fields map[string]json.RawMessage) error {
	value, ok := nonNullField(fields, "days")
	if !ok {
		return nil
	}
	var days []AnimeDay
	if err := json.Unmarshal(value, &days); err != nil {
		return fmt.Errorf("unmarshal days: %w", err)
	}
	return nil
}

// validateRepetitions validates repetition history entries.
func validateRepetitions(fields map[string]json.RawMessage) error {
	value, ok := nonNullField(fields, "repetitions")
	if !ok {
		return nil
	}
	var repetitions []map[string]json.RawMessage
	if err := json.Unmarshal(value, &repetitions); err != nil {
		return fmt.Errorf("unmarshal repetitions: %w", err)
	}
	for index, repetition := range repetitions {
		for _, key := range repetitionNumKeys {
			if err := validateNullableNumber(repetition, key); err != nil {
				return fmt.Errorf("unmarshal repetitions[%d]: %w", index, err)
			}
		}
		for _, key := range repetitionDateKeys {
			if err := validateNullableDate(repetition, key); err != nil {
				return fmt.Errorf("unmarshal repetitions[%d]: %w", index, err)
			}
		}
	}
	return nil
}
