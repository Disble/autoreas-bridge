package telemetry

import (
	"testing"
	"time"
)

// TestDeclaredConstantsAreTheContractLiterals pins each declared number to
// its literal value. WriteBudget and pruneEvery already have behavioural
// coverage, but RetryAfterSecs and MaxBodyBytes are wire-visible contract
// numbers -- Retry-After: 5, an 8 KiB body cap -- whose consumer (the
// endpoint) is a later slice. Until it lands this test is their only machine
// owner, and a silently shifted value would surface as a wrong header or a
// truncated body instead of a failing test.
func TestDeclaredConstantsAreTheContractLiterals(t *testing.T) {
	t.Parallel()

	if WriteBudget != 2*time.Second {
		t.Fatalf("expected WriteBudget to be 2s, got %v", WriteBudget)
	}
	if RetryAfterSecs != 5 {
		t.Fatalf("expected RetryAfterSecs to be 5, got %d", RetryAfterSecs)
	}
	if MaxBodyBytes != 8192 {
		t.Fatalf("expected MaxBodyBytes to be 8192, got %d", MaxBodyBytes)
	}
	if pruneEvery != 100 {
		t.Fatalf("expected pruneEvery to be 100, got %d", pruneEvery)
	}
}

// TestNewStoreDefaultsWriteBudgetOnlyWhenNonPositive asserts NewStore honors
// any positive configured budget as-is and defaults only a non-positive one,
// exercising the exact <= 0 boundary rather than only the zero-value case
// every other test in this package uses.
func TestNewStoreDefaultsWriteBudgetOnlyWhenNonPositive(t *testing.T) {
	t.Parallel()

	honored := NewStore(nil, StoreConfig{WriteBudget: 1})
	if honored.writeBudget != 1 {
		t.Fatalf("expected a positive 1ns WriteBudget to be honored as-is, got %v", honored.writeBudget)
	}

	defaulted := NewStore(nil, StoreConfig{})
	if defaulted.writeBudget != 2*time.Second {
		t.Fatalf("expected a zero WriteBudget to default to 2s, got %v", defaulted.writeBudget)
	}
}
