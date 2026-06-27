package download

import (
	"context"
	"runtime"
	"testing"
)

func TestSQLiteStoreGetJDConfigNeverReturnsCleartextPassword(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	password := "super-secret-myjd-password"
	cfg := JDConfig{Email: "user@example.com", DeviceName: "MyPC", DefaultDestDir: "C:/anime"}
	if err := store.SetJDConfig(ctx, cfg, &password); err != nil {
		t.Fatalf("SetJDConfig: %v", err)
	}
	got, err := store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if !got.HasPassword || got.Email != cfg.Email || got.DeviceName != cfg.DeviceName {
		t.Fatalf("unexpected JD config round-trip: %#v", got)
	}
	plain, ok, err := store.DecryptedPassword(ctx)
	if err != nil {
		t.Fatalf("DecryptedPassword: %v", err)
	}
	if !ok || plain != password {
		t.Fatalf("expected DecryptedPassword to round-trip the original password, got ok=%v plain=%q", ok, plain)
	}
}

func TestSQLiteStoreSetJDConfigWithNilPasswordLeavesExistingPasswordUnchanged(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	password := "original-password"
	if err := store.SetJDConfig(ctx, JDConfig{Email: "a@b.com", DeviceName: "PC1"}, &password); err != nil {
		t.Fatalf("first SetJDConfig: %v", err)
	}
	if err := store.SetJDConfig(ctx, JDConfig{Email: "new@b.com", DeviceName: "PC2"}, nil); err != nil {
		t.Fatalf("second SetJDConfig with nil password: %v", err)
	}
	got, err := store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if got.Email != "new@b.com" || got.DeviceName != "PC2" || !got.HasPassword {
		t.Fatalf("unexpected updated config: %#v", got)
	}
	plain, ok, err := store.DecryptedPassword(ctx)
	if err != nil {
		t.Fatalf("DecryptedPassword: %v", err)
	}
	if !ok || plain != password {
		t.Fatalf("expected original password preserved, got ok=%v plain=%q", ok, plain)
	}
}

func TestSQLiteStoreGetJDConfigHasPasswordFalseWhenNoneStored(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.SetJDConfig(ctx, JDConfig{Email: "a@b.com"}, nil); err != nil {
		t.Fatalf("SetJDConfig: %v", err)
	}
	got, err := store.GetJDConfig(ctx)
	if err != nil {
		t.Fatalf("GetJDConfig: %v", err)
	}
	if got.HasPassword {
		t.Fatal("expected HasPassword=false when no password has ever been set")
	}
	_, ok, err := store.DecryptedPassword(ctx)
	if err != nil {
		t.Fatalf("DecryptedPassword: %v", err)
	}
	if ok {
		t.Fatal("expected DecryptedPassword ok=false when no password is stored")
	}
}

func TestSQLiteStoreStoredPasswordBlobIsNotPlaintextOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("DPAPI ciphertext assertion is Windows-gated; skipping on " + runtime.GOOS)
	}
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	password := "super-secret-myjd-password"
	if err := store.SetJDConfig(ctx, JDConfig{Email: "a@b.com"}, &password); err != nil {
		t.Fatalf("SetJDConfig: %v", err)
	}
	var blob []byte
	if err := db.QueryRowContext(ctx, `SELECT myjd_password_encrypted FROM download_jd_config WHERE id = 1`).Scan(&blob); err != nil {
		t.Fatalf("query stored blob: %v", err)
	}
	if len(blob) == 0 {
		t.Fatal("expected a non-empty stored blob")
	}
	if containsBytes(blob, []byte(password)) {
		t.Fatal("expected the stored blob to NEVER contain the plaintext password bytes")
	}
}
