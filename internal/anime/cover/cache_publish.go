package cover

import "os"

// writeOnceFile writes data to a unique temp file under dir (an os.CreateTemp pattern) and publishes it under finalPath via publishOnce.
func writeOnceFile(dir, tempPattern, finalPath string, data []byte) error {
	tmp, err := os.CreateTemp(dir, tempPattern)
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	_, writeErr := tmp.Write(data)
	closeErr := tmp.Close()
	if writeErr != nil {
		_ = os.Remove(tmpPath)
		return writeErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return closeErr
	}
	return publishOnce(tmpPath, finalPath)
}

// publishOnce renames tmpPath to finalPath, treating a rename failure as success when finalPath already exists: measured, os.Rename fails "Access is denied" when the destination is held open via bare os.Open on this repo's Go 1.27 windows/amd64 toolchain, but not via os.ReadFile (design D4).
func publishOnce(tmpPath, finalPath string) error {
	if err := os.Rename(tmpPath, finalPath); err != nil {
		if _, statErr := os.Stat(finalPath); statErr == nil {
			_ = os.Remove(tmpPath)
			return nil
		}
		return err
	}
	return nil
}
