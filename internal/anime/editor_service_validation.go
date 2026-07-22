package anime

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

// validateEditorPatch validates an editor patch before it is applied.
func validateEditorPatch(patch EditorPatch) error {
	if len(patch.ForbiddenFields) > 0 {
		return fmt.Errorf("editor save: forbidden fields: %s", strings.Join(patch.ForbiddenFields, ", "))
	}
	return validateEditorPatchFields(patch)
}

// validateEditorPatchFields validates the individual fields of an editor patch.
func validateEditorPatchFields(patch EditorPatch) error {
	validators := []func() error{
		func() error { return validateEditorTitle(patch.Name) },
		func() error { return validateEditorStatus(patch.Status) },
		func() error { return validateEditorProgress(patch.Progress) },
		func() error {
			return validateNullableIntPatch("total episodes", patch.TotalEpisodes, true, 0, math.MaxInt)
		},
		func() error { return validateNullableIntPatch("type", patch.Kind, true, 0, 3) },
		func() error { return validateNullableIntPatch("duration", patch.Duration, false, 1, math.MaxInt) },
		func() error { return validateNullableTimePatch(patch.PremieredAt) },
		func() error { return validateNullableStringPatch("page", patch.Page) },
		func() error { return validateNullableStringPatch("folder", patch.Folder) },
		func() error { return validateNullableStringPatch("origin", patch.Origin) },
		func() error { return validateEditorURLPatch(patch.Page) },
		func() error { return validateEditorFolderPatch(patch.Folder) },
		func() error { return validateStudiosPatch(patch.Studios) },
		func() error { return validateCoverPatch(patch.Cover) },
	}
	for _, validate := range validators {
		if err := validate(); err != nil {
			return err
		}
	}
	return nil
}

// validateEditorTitle validates a patched editor title.
func validateEditorTitle(title *string) error {
	if title == nil || strings.TrimSpace(*title) != "" {
		return nil
	}
	return errors.New("editor save: title cannot be blank")
}

// validateEditorStatus validates a patched editor status.
func validateEditorStatus(status *int) error {
	if status == nil || (*status >= 0 && *status <= 3) {
		return nil
	}
	return fmt.Errorf("editor save: unsupported status %d", *status)
}

// validateEditorProgress validates a patched editor progress value.
func validateEditorProgress(progress *float64) error {
	if progress == nil || (!math.IsNaN(*progress) && !math.IsInf(*progress, 0) && *progress >= 0) {
		return nil
	}
	return errors.New("editor save: progress cannot be negative")
}

// validateEditorPatchAgainstCurrent validates a patch against the current anime.
func validateEditorPatchAgainstCurrent(patch EditorPatch, current domain.Anime) error {
	title := patchedTitle(current.Title, patch.Name)
	if strings.TrimSpace(title) == "" {
		return errors.New("editor save: title cannot be blank")
	}
	progress := patchedProgress(current.Progress, patch.Progress)
	if math.IsNaN(progress) || math.IsInf(progress, 0) || progress < 0 {
		return errors.New("editor save: progress must be a finite nonnegative number")
	}
	status := patchedStatus(current.Status, patch.Status)
	if status != nil && (*status < 0 || *status > 3) {
		return errors.New("editor save: current status is unsupported")
	}
	return validateCurrentEditorFields(patch, current)
}

// validateCurrentEditorFields validates unchanged editor fields in the current anime.
func validateCurrentEditorFields(patch EditorPatch, current domain.Anime) error {
	validators := []func() error{
		func() error {
			if patch.TotalEpisodes.Present {
				return nil
			}
			return validateCurrentOptionalNumber("total episodes", current.TotalEpisodes, true)
		},
		func() error {
			if patch.Duration.Present {
				return nil
			}
			return validateCurrentOptionalNumber("duration", current.DurationMinutes, false)
		},
		func() error { return validateCurrentKind(current.ContentType, patch.Kind.Present) },
		func() error { return validateEditorActivation(patch.Active, current.Active) },
		func() error { return validateEditorPlacements(patch.Placements) },
	}
	for _, validate := range validators {
		if err := validate(); err != nil {
			return err
		}
	}
	return nil
}

// validateCurrentKind validates the current content type when it is retained.
func validateCurrentKind(kind *int, replaced bool) error {
	if replaced || kind == nil || (*kind >= 0 && *kind <= 3) {
		return nil
	}
	return errors.New("editor save: current type is unsupported")
}

// validateEditorActivation validates activation changes against the current state.
func validateEditorActivation(active *bool, current domain.TriState) error {
	if active == nil || !*active || current == domain.TriStateTrue {
		return nil
	}
	return errors.New("editor save: inactive anime can only be restored through lifecycle restore")
}

// validateCurrentOptionalNumber validates an unchanged optional numeric field.
func validateCurrentOptionalNumber(name string, value *float64, allowZero bool) error {
	if value == nil {
		return nil
	}
	if math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 || math.Trunc(*value) != *value || (!allowZero && *value == 0) {
		return fmt.Errorf("editor save: current %s is invalid", name)
	}
	return nil
}

// validateEditorPlacements validates the schedule placements in an editor patch.
func validateEditorPlacements(placements []contracts.MobileAnimeDay) error {
	seen := map[string]struct{}{}
	for _, placement := range placements {
		if _, allowed := allowedScheduleDestinations[placement.Day]; !allowed || placement.Order <= 0 {
			return fmt.Errorf("editor save: invalid schedule placement %q at %d", placement.Day, placement.Order)
		}
		key := fmt.Sprintf("%s#%d", placement.Day, placement.Order)
		if _, duplicate := seen[key]; duplicate {
			return fmt.Errorf("editor save: duplicate schedule placement %s", key)
		}
		seen[key] = struct{}{}
	}
	return nil
}

// validateNullableStringPatch validates the shape of a nullable string patch.
func validateNullableStringPatch(name string, patch EditorNullableStringPatch) error {
	if !patch.Present && (patch.Clear || patch.Value != "") {
		return fmt.Errorf("editor save: malformed omitted %s patch", name)
	}
	if patch.Clear && patch.Value != "" {
		return fmt.Errorf("editor save: malformed cleared %s patch", name)
	}
	return nil
}

// validateNullableIntPatch validates the shape and range of a nullable integer patch.
func validateNullableIntPatch(name string, patch EditorNullableIntPatch, allowZero bool, minimum, maximum int) error {
	if !patch.Present && (patch.Clear || patch.Value != 0) {
		return fmt.Errorf("editor save: malformed omitted %s patch", name)
	}
	if patch.Clear && patch.Value != 0 {
		return fmt.Errorf("editor save: malformed cleared %s patch", name)
	}
	if !patch.Present || patch.Clear {
		return nil
	}
	if patch.Value < minimum || patch.Value > maximum || (!allowZero && patch.Value == 0) {
		return fmt.Errorf("editor save: invalid %s %d", name, patch.Value)
	}
	return nil
}

// validateNullableTimePatch validates the shape and range of a nullable time patch.
func validateNullableTimePatch(patch EditorNullableTimePatch) error {
	if !patch.Present && (patch.Clear || patch.UnixMilli != 0) {
		return errors.New("editor save: malformed omitted premiere date patch")
	}
	if patch.Clear && patch.UnixMilli != 0 {
		return errors.New("editor save: malformed cleared premiere date patch")
	}
	if patch.Present && !patch.Clear && (patch.UnixMilli < 0 || patch.UnixMilli > 253402300799999) {
		return errors.New("editor save: invalid premiere date")
	}
	return nil
}

// validateEditorURLPatch validates a patched editor page URL.
func validateEditorURLPatch(patch EditorNullableStringPatch) error {
	if !patch.Present || patch.Clear || strings.TrimSpace(patch.Value) == "" {
		return nil
	}
	if err := ValidatePageURL(patch.Value); err != nil {
		return fmt.Errorf("editor save: %w", err)
	}
	return nil
}

// validateEditorFolderPatch validates a patched editor folder path.
func validateEditorFolderPatch(patch EditorNullableStringPatch) error {
	if !patch.Present || patch.Clear || strings.TrimSpace(patch.Value) == "" {
		return nil
	}
	if err := ValidateLocalFolder(patch.Value); err != nil {
		return fmt.Errorf("editor save: %w", err)
	}
	return nil
}

// validateStudiosPatch validates the shape of a patched studio list.
func validateStudiosPatch(patch EditorStudiosPatch) error {
	if !patch.Present && (patch.Clear || patch.Values != nil) {
		return errors.New("editor save: malformed omitted studios patch")
	}
	if patch.Clear && len(patch.Values) > 0 {
		return errors.New("editor save: malformed cleared studios patch")
	}
	return nil
}

// validateCoverPatch validates the shape and contents of a patched cover.
func validateCoverPatch(patch EditorCoverPatch) error {
	if !patch.Present && (patch.Clear || patch.Type != "" || patch.Path != "" || patch.Raw != nil) {
		return errors.New("editor save: malformed omitted cover patch")
	}
	if patch.Clear && (patch.Type != "" || patch.Path != "" || patch.Raw != nil) {
		return errors.New("editor save: malformed cleared cover patch")
	}
	if patch.Present && !patch.Clear && strings.TrimSpace(patch.Type) == "" {
		return errors.New("editor save: cover type cannot be blank")
	}
	for key, value := range patch.Raw {
		if key == "type" || key == "path" || !json.Valid(value) {
			return fmt.Errorf("editor save: invalid cover raw field %q", key)
		}
	}
	return nil
}
