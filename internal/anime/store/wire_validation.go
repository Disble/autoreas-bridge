package store

import (
	"encoding/json"
	"fmt"
)

var (
	nullableNumberKeys = []string{"estado", "totalcap", "duracion", "tipo", "orden"}
	nullableBoolKeys   = []string{"activo", "primeravez"}
	nullableStringKeys = []string{"pagina", "carpeta", "origen", "dia"}
	nullableDateKeys   = []string{"fechaEstreno", "fechaUltCapVisto", "fechaCreacion", "fechaEliminacion"}
	nullableArrayKeys  = []string{"estudios", "generos"}
	repetitionNumKeys  = []string{"numrepeticion", "nrocapvisto", "estado"}
	repetitionDateKeys = []string{"fechaCreacion", "fechaEstreno", "fechaUltCapVisto", "fechaEliminacion", "fechaRepeticion"}
)

// validateKnownFields validates all recognized legacy fields.
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

// validateNullableDate validates an optional legacy date wrapper.
func validateNullableDate(fields map[string]json.RawMessage, key string) error {
	value, ok := nonNullField(fields, key)
	if !ok {
		return nil
	}
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(value, &wrapper); err != nil {
		return fmt.Errorf("unmarshal %s: unmarshal legacy date wrapper: %w", key, err)
	}
	dateValue, ok := wrapper["$$date"]
	if !ok || len(wrapper) != 1 {
		return fmt.Errorf("unmarshal %s: unmarshal legacy date wrapper: expected object with only $$date", key)
	}
	var date int64
	if err := json.Unmarshal(dateValue, &date); err != nil {
		return fmt.Errorf("unmarshal %s: unmarshal legacy date wrapper: %w", key, err)
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

// validateDays validates the legacy days array.
func validateDays(fields map[string]json.RawMessage) error {
	value, ok := nonNullField(fields, "dias")
	if !ok {
		return nil
	}
	var days []AnimeDay
	if err := json.Unmarshal(value, &days); err != nil {
		return fmt.Errorf("unmarshal dias: %w", err)
	}
	return nil
}

// validateRepetitions validates legacy repetition entries.
func validateRepetitions(fields map[string]json.RawMessage) error {
	value, ok := nonNullField(fields, "repetir")
	if !ok {
		return nil
	}
	var repetitions []map[string]json.RawMessage
	if err := json.Unmarshal(value, &repetitions); err != nil {
		return fmt.Errorf("unmarshal repetir: %w", err)
	}
	for index, repetition := range repetitions {
		for _, key := range repetitionNumKeys {
			if err := validateNullableNumber(repetition, key); err != nil {
				return fmt.Errorf("unmarshal repetir[%d]: %w", index, err)
			}
		}
		for _, key := range repetitionDateKeys {
			if err := validateNullableDate(repetition, key); err != nil {
				return fmt.Errorf("unmarshal repetir[%d]: %w", index, err)
			}
		}
	}
	return nil
}
