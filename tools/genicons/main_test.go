package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// solidNRGBA builds a test image from a grid of red-channel values, opaque.
func solidNRGBA(rows [][]uint8) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, len(rows[0]), len(rows)))
	for y, row := range rows {
		for x, v := range row {
			img.SetNRGBA(x, y, color.NRGBA{R: v, G: v, B: v, A: 255})
		}
	}
	return img
}

// redChannel reads back the red channel as a grid for comparison.
func redChannel(img *image.NRGBA) [][]uint8 {
	out := make([][]uint8, img.Bounds().Dy())
	for y := range out {
		out[y] = make([]uint8, img.Bounds().Dx())
		for x := range out[y] {
			out[y][x] = img.NRGBAAt(x, y).R
		}
	}
	return out
}

func TestResizeAreaAveragesWholeSourceBlocks(t *testing.T) {
	src := solidNRGBA([][]uint8{
		{0, 0, 100, 100},
		{0, 0, 100, 100},
		{200, 200, 255, 255},
		{200, 200, 255, 255},
	})

	got := redChannel(resizeArea(src, 2, 2))

	want := [][]uint8{{0, 100}, {200, 255}}
	for y := range want {
		for x := range want[y] {
			if got[y][x] != want[y][x] {
				t.Fatalf("pixel (%d,%d) = %d, want %d", x, y, got[y][x], want[y][x])
			}
		}
	}
}

func TestResizeAreaWeightsPartialPixelsOnNonIntegerRatios(t *testing.T) {
	src := solidNRGBA([][]uint8{
		{0, 60, 120},
		{30, 90, 150},
		{60, 120, 180},
	})

	got := redChannel(resizeArea(src, 2, 2))

	// Hand-computed 1.5:1 area weights; literals on purpose so the test cannot
	// agree with a broken implementation by sharing its arithmetic.
	want := [][]uint8{{30, 110}, {70, 150}}
	for y := range want {
		for x := range want[y] {
			if got[y][x] != want[y][x] {
				t.Fatalf("pixel (%d,%d) = %d, want %d", x, y, got[y][x], want[y][x])
			}
		}
	}
}

func TestResizeAreaKeepsTransparencyOutOfVisibleColour(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	src.SetNRGBA(0, 0, color.NRGBA{R: 255, G: 0, B: 0, A: 255})
	src.SetNRGBA(1, 0, color.NRGBA{R: 0, G: 0, B: 255, A: 0})

	got := resizeArea(src, 1, 1).NRGBAAt(0, 0)

	// The transparent pixel contributes no colour, only alpha: averaging in
	// straight (non-premultiplied) space would drag the red down to 128.
	if got.R != 255 || got.B != 0 {
		t.Fatalf("colour = %+v, want fully red", got)
	}
	if got.A != 128 {
		t.Fatalf("alpha = %d, want 128", got.A)
	}
}

// icoEntry is a parsed ICONDIRENTRY used to assert on encoder output.
type icoEntry struct {
	Width  uint8
	Height uint8
	Bytes  uint32
	Offset uint32
}

// parseICO reads the directory of an ICO file for assertions.
func parseICO(t *testing.T, data []byte) []icoEntry {
	t.Helper()
	if len(data) < 6 {
		t.Fatalf("ICO shorter than its header: %d bytes", len(data))
	}
	if got := binary.LittleEndian.Uint16(data[0:2]); got != 0 {
		t.Fatalf("reserved field = %d, want 0", got)
	}
	if got := binary.LittleEndian.Uint16(data[2:4]); got != 1 {
		t.Fatalf("type field = %d, want 1", got)
	}
	count := int(binary.LittleEndian.Uint16(data[4:6]))
	entries := make([]icoEntry, count)
	for i := range entries {
		off := 6 + i*16
		entries[i] = icoEntry{
			Width:  data[off],
			Height: data[off+1],
			Bytes:  binary.LittleEndian.Uint32(data[off+8 : off+12]),
			Offset: binary.LittleEndian.Uint32(data[off+12 : off+16]),
		}
	}
	return entries
}

func TestEncodeICOWritesOneDirectoryEntryPerSize(t *testing.T) {
	master := solidNRGBA([][]uint8{{10, 20}, {30, 40}})

	data, err := encodeICO(master, []int{16, 32, 256})
	if err != nil {
		t.Fatalf("encodeICO: %v", err)
	}

	entries := parseICO(t, data)
	if len(entries) != 3 {
		t.Fatalf("entry count = %d, want 3", len(entries))
	}
	// 256 does not fit in a byte and the format spells it as 0.
	wantDims := []uint8{16, 32, 0}
	for i, want := range wantDims {
		if entries[i].Width != want || entries[i].Height != want {
			t.Fatalf("entry %d dims = %dx%d, want %d", i, entries[i].Width, entries[i].Height, want)
		}
	}
	for i, e := range entries {
		if int(e.Offset)+int(e.Bytes) > len(data) {
			t.Fatalf("entry %d payload runs past the file: offset=%d bytes=%d len=%d",
				i, e.Offset, e.Bytes, len(data))
		}
	}
}

func TestEncodeICOUsesDIBBelowThePNGThresholdAndPNGAbove(t *testing.T) {
	master := solidNRGBA([][]uint8{{10, 20}, {30, 40}})

	data, err := encodeICO(master, []int{64, 128})
	if err != nil {
		t.Fatalf("encodeICO: %v", err)
	}

	entries := parseICO(t, data)
	small := data[entries[0].Offset : entries[0].Offset+entries[0].Bytes]
	large := data[entries[1].Offset : entries[1].Offset+entries[1].Bytes]

	// NSIS reads MUI_ICON entries as device-independent bitmaps, so anything an
	// installer has to draw stays DIB; only the shell-only sizes use PNG.
	if got := binary.LittleEndian.Uint32(small[0:4]); got != 40 {
		t.Fatalf("64px entry starts with header size %d, want a 40-byte BITMAPINFOHEADER", got)
	}
	if !bytes.HasPrefix(large, []byte("\x89PNG\r\n\x1a\n")) {
		t.Fatalf("128px entry is not PNG-compressed")
	}
}

func TestEncodeICODIBEntryCarriesADoubleHeightAndMask(t *testing.T) {
	master := solidNRGBA([][]uint8{{10, 20}, {30, 40}})

	data, err := encodeICO(master, []int{16})
	if err != nil {
		t.Fatalf("encodeICO: %v", err)
	}

	entries := parseICO(t, data)
	dib := data[entries[0].Offset : entries[0].Offset+entries[0].Bytes]
	if got := int32(binary.LittleEndian.Uint32(dib[8:12])); got != 32 {
		t.Fatalf("biHeight = %d, want 32 (image plus AND mask)", got)
	}
	if got := binary.LittleEndian.Uint16(dib[14:16]); got != 32 {
		t.Fatalf("biBitCount = %d, want 32", got)
	}
	// 40 header + 16*16*4 colour + 16 rows of a 4-byte-padded 1bpp mask.
	if want := 40 + 1024 + 64; len(dib) != want {
		t.Fatalf("DIB length = %d, want %d", len(dib), want)
	}
}

func TestEncodeICOPNGEntryDecodesBackAtTheRequestedSize(t *testing.T) {
	master := solidNRGBA([][]uint8{{10, 20}, {30, 40}})

	data, err := encodeICO(master, []int{256})
	if err != nil {
		t.Fatalf("encodeICO: %v", err)
	}

	entries := parseICO(t, data)
	payload := data[entries[0].Offset : entries[0].Offset+entries[0].Bytes]
	img, err := png.Decode(bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("decode PNG entry: %v", err)
	}
	if img.Bounds().Dx() != 256 || img.Bounds().Dy() != 256 {
		t.Fatalf("PNG entry is %v, want 256x256", img.Bounds().Size())
	}
}

// writeMaster puts a small master PNG on disk for the run-level tests.
func writeMaster(t *testing.T, root string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, "build"), 0o755); err != nil {
		t.Fatalf("create build dir: %v", err)
	}
	f, err := os.Create(filepath.Join(root, masterPath))
	if err != nil {
		t.Fatalf("create master: %v", err)
	}
	defer func() { _ = f.Close() }()
	if err := png.Encode(f, solidNRGBA([][]uint8{{10, 20}, {30, 40}})); err != nil {
		t.Fatalf("encode master: %v", err)
	}
}

func TestRunWritesEveryTargetFromTheMaster(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)

	var out, errOut bytes.Buffer
	if err := run(root, false, &out, &errOut); err != nil {
		t.Fatalf("run: %v (stderr=%s)", err, errOut.String())
	}

	for _, target := range targets {
		if _, err := os.Stat(filepath.Join(root, target.Path)); err != nil {
			t.Fatalf("target %s was not written: %v", target.Path, err)
		}
	}
}

func TestRunInCheckModeFailsWhenATargetDrifts(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)

	var out, errOut bytes.Buffer
	if err := run(root, false, &out, &errOut); err != nil {
		t.Fatalf("generate: %v", err)
	}
	drifted := filepath.Join(root, targets[0].Path)
	if err := os.WriteFile(drifted, []byte("not an icon"), 0o644); err != nil {
		t.Fatalf("corrupt target: %v", err)
	}

	out.Reset()
	errOut.Reset()
	err := run(root, true, &out, &errOut)

	if err == nil {
		t.Fatal("check mode passed on a drifted target")
	}
	if !strings.Contains(errOut.String(), targets[0].Path) {
		t.Fatalf("stderr does not name the drifted target: %s", errOut.String())
	}
}

func TestRunInCheckModeFailsWhenATargetIsMissing(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)

	var out, errOut bytes.Buffer
	err := run(root, true, &out, &errOut)

	if err == nil {
		t.Fatal("check mode passed with no targets on disk")
	}
}

func TestRunInCheckModeAcceptsFreshlyGeneratedTargets(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)

	var out, errOut bytes.Buffer
	if err := run(root, false, &out, &errOut); err != nil {
		t.Fatalf("generate: %v", err)
	}

	out.Reset()
	errOut.Reset()
	if err := run(root, true, &out, &errOut); err != nil {
		t.Fatalf("check after generate: %v (stderr=%s)", err, errOut.String())
	}
}

func TestRunReportsAMissingMaster(t *testing.T) {
	root := t.TempDir()

	var out, errOut bytes.Buffer
	err := run(root, false, &out, &errOut)

	if err == nil {
		t.Fatal("run passed without a master icon")
	}
	if !strings.Contains(errOut.String(), masterPath) {
		t.Fatalf("stderr does not name the master: %s", errOut.String())
	}
}
