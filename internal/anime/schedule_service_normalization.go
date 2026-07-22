package anime

import (
	"sort"

	"autoreas-bridge/internal/api/contracts"
)

// desiredSchedulePlacements builds desired placements from records and a draft.
func desiredSchedulePlacements(records []ReadRecord, command ApplyAnimeScheduleDraftCommand) map[string][]contracts.MobileAnimeDay {
	placementsByAnime := map[string][]contracts.MobileAnimeDay{}
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Active != 1 {
			continue
		}
		placementsByAnime[item.ID] = cloneMobileDays(item.Days)
	}
	for _, entry := range command.Entries {
		placementsByAnime[entry.AnimeID] = cloneMobileDays(entry.Placements)
	}
	return placementsByAnime
}

// normalizedSchedulePlacements materializes the authoritative order after a partial
// draft. A top insertion changes every following position; an untouched destination
// retains its legacy bytes and cannot block the operation.
func normalizedSchedulePlacements(records []ReadRecord, command ApplyAnimeScheduleDraftCommand) map[string][]contracts.MobileAnimeDay {
	placementsByAnime := desiredSchedulePlacements(records, command)
	return normalizeSchedulePlacementsForDraft(placementsByAnime, command, reflowScheduleDestinations(records, command, placementsByAnime))
}

// normalizeSchedulePlacementsForDraft merges moved cards into each affected queue.
// Requested positions are indexes in the visible column; unchanged cards keep their
// relative order and are shifted around those insertions.
func normalizeSchedulePlacementsForDraft(placementsByAnime map[string][]contracts.MobileAnimeDay, command ApplyAnimeScheduleDraftCommand, reflow map[string]struct{}) map[string][]contracts.MobileAnimeDay {
	result, byDestination := splitReflowPlacements(placementsByAnime, reflow)
	changed := scheduleEntryIDs(command.Entries)
	for destination := range reflow {
		appendNormalizedDestination(result, destination, mergeDraftDestinationRefs(byDestination[destination], changed))
	}
	return result
}

// splitReflowPlacements separates placements that require destination reflow.
func splitReflowPlacements(placementsByAnime map[string][]contracts.MobileAnimeDay, reflow map[string]struct{}) (map[string][]contracts.MobileAnimeDay, map[string][]schedulePlacementRef) {
	result := map[string][]contracts.MobileAnimeDay{}
	byDestination := map[string][]schedulePlacementRef{}
	for animeID, placements := range placementsByAnime {
		for index, placement := range placements {
			if _, normalize := reflow[placement.Day]; normalize {
				byDestination[placement.Day] = append(byDestination[placement.Day], schedulePlacementRef{animeID: animeID, order: placement.Order, index: index})
				continue
			}
			result[animeID] = append(result[animeID], placement)
		}
	}
	return result, byDestination
}

// mergeDraftDestinationRefs merges unchanged and moved destination references.
func mergeDraftDestinationRefs(refs []schedulePlacementRef, changed map[string]struct{}) []schedulePlacementRef {
	unchanged, inserted := partitionDraftDestinationRefs(refs, changed)
	sortSchedulePlacementRefs(unchanged)
	sortSchedulePlacementRefs(inserted)
	for _, ref := range inserted {
		unchanged = insertSchedulePlacementRef(unchanged, ref)
	}
	return unchanged
}

// partitionDraftDestinationRefs separates unchanged references from moved ones.
func partitionDraftDestinationRefs(refs []schedulePlacementRef, changed map[string]struct{}) ([]schedulePlacementRef, []schedulePlacementRef) {
	unchanged := make([]schedulePlacementRef, 0)
	inserted := make([]schedulePlacementRef, 0)
	for _, ref := range refs {
		if _, isChanged := changed[ref.animeID]; isChanged {
			inserted = append(inserted, ref)
			continue
		}
		unchanged = append(unchanged, ref)
	}
	return unchanged, inserted
}

// sortSchedulePlacementRefs orders placement references deterministically.
func sortSchedulePlacementRefs(refs []schedulePlacementRef) {
	sort.SliceStable(refs, func(i, j int) bool {
		if refs[i].order != refs[j].order {
			return refs[i].order < refs[j].order
		}
		return refs[i].animeID < refs[j].animeID
	})
}

// insertSchedulePlacementRef inserts a placement reference at its requested order.
func insertSchedulePlacementRef(refs []schedulePlacementRef, ref schedulePlacementRef) []schedulePlacementRef {
	index := ref.order - 1
	if index < 0 {
		index = 0
	}
	if index > len(refs) {
		index = len(refs)
	}
	refs = append(refs, schedulePlacementRef{})
	copy(refs[index+1:], refs[index:])
	refs[index] = ref
	return refs
}

// appendNormalizedDestination writes normalized references into the result map.
func appendNormalizedDestination(result map[string][]contracts.MobileAnimeDay, destination string, refs []schedulePlacementRef) {
	for index, ref := range refs {
		result[ref.animeID] = append(result[ref.animeID], contracts.MobileAnimeDay{Day: destination, Order: index + 1})
	}
}

// reflowScheduleDestinations identifies queues whose stored positions must change.
// Source queues always reflow after cards leave; destination queues reflow when a
// moved card occupies an existing position.
func reflowScheduleDestinations(records []ReadRecord, command ApplyAnimeScheduleDraftCommand, placementsByAnime map[string][]contracts.MobileAnimeDay) map[string]struct{} {
	affected := affectedScheduleDestinations(records, command)
	submittedDestinations := submittedScheduleDestinations(command.Entries)
	reflow := map[string]struct{}{}
	for destination := range affected {
		if destinationNeedsReflow(destination, submittedDestinations, placementsByAnime) {
			reflow[destination] = struct{}{}
		}
	}
	return reflow
}

// destinationNeedsReflow reports whether a schedule destination needs reordering.
func destinationNeedsReflow(destination string, submittedDestinations map[string]struct{}, placementsByAnime map[string][]contracts.MobileAnimeDay) bool {
	if _, submitted := submittedDestinations[destination]; !submitted {
		return true
	}
	return destinationHasDuplicateOrders(destination, placementsByAnime)
}

// destinationHasDuplicateOrders reports whether a destination has duplicate orders.
func destinationHasDuplicateOrders(destination string, placementsByAnime map[string][]contracts.MobileAnimeDay) bool {
	seen := map[int]struct{}{}
	for _, placements := range placementsByAnime {
		for _, placement := range placements {
			if placement.Day != destination {
				continue
			}
			if _, exists := seen[placement.Order]; exists {
				return true
			}
			seen[placement.Order] = struct{}{}
		}
	}
	return false
}

// affectedScheduleDestinations returns both sides of every move: destinations in
// submitted placements and the original destinations of the moved cards.
func affectedScheduleDestinations(records []ReadRecord, command ApplyAnimeScheduleDraftCommand) map[string]struct{} {
	affected := affectedDestinationsFromEntries(command.Entries)
	changed := scheduleEntryIDs(command.Entries)
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Active != 1 || !isChangedScheduleAnime(changed, item.ID) {
			continue
		}
		addAllowedScheduleDestinations(affected, item.Days)
	}
	return affected
}

// affectedDestinationsFromEntries returns valid destinations in draft entries.
func affectedDestinationsFromEntries(entries []ApplyAnimeScheduleDraftEntry) map[string]struct{} {
	affected := map[string]struct{}{}
	for _, entry := range entries {
		addAllowedScheduleDestinations(affected, entry.Placements)
	}
	return affected
}

// addAllowedScheduleDestinations adds valid placement destinations to a set.
func addAllowedScheduleDestinations(destinations map[string]struct{}, placements []contracts.MobileAnimeDay) {
	for _, placement := range placements {
		if _, ok := allowedScheduleDestinations[placement.Day]; ok {
			destinations[placement.Day] = struct{}{}
		}
	}
}

// normalizeSchedulePlacementsMap canonicalizes placement orders by destination.
func normalizeSchedulePlacementsMap(placementsByAnime map[string][]contracts.MobileAnimeDay) map[string][]contracts.MobileAnimeDay {
	byDestination := map[string][]schedulePlacementRef{}
	result := map[string][]contracts.MobileAnimeDay{}
	for animeID, placements := range placementsByAnime {
		for index, placement := range placements {
			if _, ok := allowedScheduleDestinations[placement.Day]; !ok {
				result[animeID] = append(result[animeID], placement)
				continue
			}
			byDestination[placement.Day] = append(byDestination[placement.Day], schedulePlacementRef{animeID: animeID, order: placement.Order, index: index})
		}
	}
	for _, destination := range scheduleDestinationOrder() {
		refs := byDestination[destination]
		sort.SliceStable(refs, func(i, j int) bool {
			if refs[i].order != refs[j].order {
				return refs[i].order < refs[j].order
			}
			if refs[i].animeID != refs[j].animeID {
				return refs[i].animeID < refs[j].animeID
			}
			return refs[i].index < refs[j].index
		})
		for index, ref := range refs {
			result[ref.animeID] = append(result[ref.animeID], contracts.MobileAnimeDay{Day: destination, Order: index + 1})
		}
	}
	return result
}
