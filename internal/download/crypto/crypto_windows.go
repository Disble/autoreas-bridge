//go:build windows

// Package crypto provides the Protect/Unprotect seam used to encrypt the MyJDownloader
// password at rest (design.md §7, ADR-4/ADR-7). This file is the REAL Windows DPAPI
// implementation: CryptProtectData/CryptUnprotectData scoped to the CURRENT WINDOWS USER
// (CRYPTPROTECT_LOCAL_MACHINE is intentionally never set, so the OS derives the key from
// the logged-in Windows session and another user on the same machine cannot decrypt it).
// No entropy/secondary password is used: the Windows user account is the trust boundary.
package crypto

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Insecure is always false on Windows: this build uses the real DPAPI implementation.
const Insecure = false

// Protect encrypts plaintext via DPAPI CryptProtectData at current-user scope.
func Protect(plaintext []byte) ([]byte, error) {
	in := bytesToDataBlob(plaintext)

	var out windows.DataBlob
	if err := windows.CryptProtectData(&in, nil, nil, 0, nil, 0, &out); err != nil {
		return nil, fmt.Errorf("dpapi protect: %w", err)
	}
	defer freeDataBlob(out)

	return dataBlobToBytes(out), nil
}

// Unprotect decrypts a DPAPI ciphertext blob via CryptUnprotectData. On failure it returns
// an empty plaintext and a non-nil error -- the caller (the JD adapter / store) is
// responsible for recording the concrete error in download_jd_config.last_decrypt_error and
// treating it as non-fatal (design §7 C4 sink). The plaintext is never logged here.
func Unprotect(ciphertext []byte) ([]byte, error) {
	in := bytesToDataBlob(ciphertext)

	var out windows.DataBlob
	if err := windows.CryptUnprotectData(&in, nil, nil, 0, nil, 0, &out); err != nil {
		return nil, fmt.Errorf("dpapi unprotect: %w", err)
	}
	defer freeDataBlob(out)

	return dataBlobToBytes(out), nil
}

// bytesToDataBlob converts bytes into a Windows data blob.
func bytesToDataBlob(b []byte) windows.DataBlob {
	var blob windows.DataBlob
	if len(b) > 0 {
		blob.Size = uint32(len(b))
		blob.Data = &b[0]
	}
	return blob
}

// dataBlobToBytes copies bytes from a Windows data blob.
func dataBlobToBytes(blob windows.DataBlob) []byte {
	if blob.Data == nil || blob.Size == 0 {
		return []byte{}
	}
	src := unsafe.Slice(blob.Data, int(blob.Size))
	out := make([]byte, len(src))
	copy(out, src)
	return out
}

// freeDataBlob releases memory owned by a Windows data blob.
func freeDataBlob(blob windows.DataBlob) {
	if blob.Data == nil {
		return
	}
	_, _ = windows.LocalFree(windows.Handle(unsafe.Pointer(blob.Data)))
}
