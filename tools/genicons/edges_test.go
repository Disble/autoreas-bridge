package main

import (
	"bytes"
	"image"
	"image/color"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestToNRGBAReturnsTheSameImageWhenItIsAlreadyNRGBA(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 2, 2))

	if got := toNRGBA(src); got != src {
		t.Fatal("toNRGBA copied an image that was already in the target format")
	}
}

func TestToNRGBAUnpremultipliesAnRGBASource(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 1, 1))
	// image.RGBA stores premultiplied channels: half-transparent pure red.
	src.SetRGBA(0, 0, color.RGBA{R: 128, G: 0, B: 0, A: 128})

	got := toNRGBA(src).NRGBAAt(0, 0)

	want := color.NRGBA{R: 255, G: 0, B: 0, A: 128}
	if got != want {
		t.Fatalf("pixel = %+v, want %+v", got, want)
	}
}

func TestToNRGBAConvertsAPalettedSource(t *testing.T) {
	palette := color.Palette{
		color.NRGBA{R: 10, G: 20, B: 30, A: 255},
		color.NRGBA{R: 200, G: 100, B: 50, A: 255},
	}
	src := image.NewPaletted(image.Rect(0, 0, 2, 1), palette)
	src.SetColorIndex(0, 0, 0)
	src.SetColorIndex(1, 0, 1)

	out := toNRGBA(src)

	if got, want := out.NRGBAAt(0, 0), (color.NRGBA{R: 10, G: 20, B: 30, A: 255}); got != want {
		t.Fatalf("pixel 0 = %+v, want %+v", got, want)
	}
	if got, want := out.NRGBAAt(1, 0), (color.NRGBA{R: 200, G: 100, B: 50, A: 255}); got != want {
		t.Fatalf("pixel 1 = %+v, want %+v", got, want)
	}
}

func TestToNRGBALeavesFullyTransparentPixelsZeroed(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 1, 1))
	src.SetRGBA(0, 0, color.RGBA{})

	if got := toNRGBA(src).NRGBAAt(0, 0); got != (color.NRGBA{}) {
		t.Fatalf("pixel = %+v, want the zero value", got)
	}
}

func TestToNRGBAConvertsFromASourceWithANonZeroOrigin(t *testing.T) {
	// A decoder may hand back an image whose bounds do not start at (0,0); the
	// conversion has to read through Min rather than assume the origin.
	src := image.NewRGBA(image.Rect(5, 7, 6, 8))
	src.SetRGBA(5, 7, color.RGBA{R: 40, G: 50, B: 60, A: 255})

	out := toNRGBA(src)

	if got := out.Bounds(); got != image.Rect(0, 0, 1, 1) {
		t.Fatalf("bounds = %v, want a 1x1 image rebased on the origin", got)
	}
	if got, want := out.NRGBAAt(0, 0), (color.NRGBA{R: 40, G: 50, B: 60, A: 255}); got != want {
		t.Fatalf("pixel = %+v, want %+v", got, want)
	}
}

func TestResizeAreaReturnsAnEmptyImageForAZeroDimension(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 4, 4))

	for _, size := range []struct{ w, h int }{{0, 4}, {4, 0}, {0, 0}} {
		got := resizeArea(src, size.w, size.h)
		if got.Bounds() != image.Rect(0, 0, size.w, size.h) {
			t.Fatalf("resizeArea(%d,%d) bounds = %v", size.w, size.h, got.Bounds())
		}
	}
}

func TestResizeAreaHandlesAZeroSizedSource(t *testing.T) {
	got := resizeArea(image.NewNRGBA(image.Rect(0, 0, 0, 0)), 2, 2)

	if got.Bounds() != image.Rect(0, 0, 2, 2) {
		t.Fatalf("bounds = %v, want a 2x2 image", got.Bounds())
	}
	if got.NRGBAAt(0, 0) != (color.NRGBA{}) {
		t.Fatal("a source with no pixels should produce transparent output, not colour")
	}
}

func TestResizeAreaSaturatesRatherThanWrappingOnFullBrightness(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	for y := range 2 {
		for x := range 2 {
			src.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}

	if got := resizeArea(src, 1, 1); got.NRGBAAt(0, 0).R != 255 {
		t.Fatalf("red = %d, want 255", got.NRGBAAt(0, 0).R)
	}
}

func TestEncodeICORejectsAnEmptySizeList(t *testing.T) {
	if _, err := encodeICO(image.NewNRGBA(image.Rect(0, 0, 2, 2)), nil); err == nil {
		t.Fatal("encodeICO accepted a request for no sizes at all")
	}
}

func TestEncodeICORejectsSizesOutsideTheFormatRange(t *testing.T) {
	master := image.NewNRGBA(image.Rect(0, 0, 2, 2))

	// An ICONDIRENTRY addresses a dimension in one byte, with 0 meaning 256.
	for _, size := range []int{0, -1, 257, 1024} {
		if _, err := encodeICO(master, []int{size}); err == nil {
			t.Fatalf("encodeICO accepted the out-of-range size %d", size)
		}
	}
}

func TestEncodeICOMarksTransparentPixelsInTheANDMask(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 16, 16))
	for y := range 16 {
		for x := range 16 {
			src.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	src.SetNRGBA(0, 0, color.NRGBA{})
	src.SetNRGBA(9, 3, color.NRGBA{})

	data, err := encodeICO(src, []int{16})
	if err != nil {
		t.Fatalf("encodeICO: %v", err)
	}

	entries := parseICO(t, data)
	dib := data[entries[0].Offset : entries[0].Offset+entries[0].Bytes]
	// 40-byte header, then 16*16 BGRA pixels, then the mask. Mask rows are
	// bottom-up, so image row 0 is the last of the 16 rows written.
	mask := dib[40+16*16*4:]
	if got := mask[15*4+0]; got != 0x80 {
		t.Fatalf("mask byte for pixel (0,0) = %#02x, want 0x80", got)
	}
	if got := mask[12*4+1]; got != 0x40 {
		t.Fatalf("mask byte for pixel (9,3) = %#02x, want 0x40", got)
	}
}

func TestEncodeICOLeavesTheANDMaskClearForAnOpaqueImage(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 16, 16))
	for y := range 16 {
		for x := range 16 {
			src.SetNRGBA(x, y, color.NRGBA{R: 1, G: 2, B: 3, A: 255})
		}
	}

	data, err := encodeICO(src, []int{16})
	if err != nil {
		t.Fatalf("encodeICO: %v", err)
	}

	entries := parseICO(t, data)
	dib := data[entries[0].Offset : entries[0].Offset+entries[0].Bytes]
	for i, b := range dib[40+16*16*4:] {
		if b != 0 {
			t.Fatalf("mask byte %d = %#02x on a fully opaque image, want 0", i, b)
		}
	}
}

func TestEncodeICOWritesPixelsBottomUpInBGRAOrder(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	src.SetNRGBA(0, 0, color.NRGBA{R: 10, G: 20, B: 30, A: 255}) // top-left
	src.SetNRGBA(0, 1, color.NRGBA{R: 40, G: 50, B: 60, A: 255}) // bottom-left
	src.SetNRGBA(1, 1, color.NRGBA{R: 70, G: 80, B: 90, A: 255}) // bottom-right
	src.SetNRGBA(1, 0, color.NRGBA{R: 11, G: 12, B: 13, A: 255}) // top-right

	data, err := encodeICO(src, []int{2})
	if err != nil {
		t.Fatalf("encodeICO: %v", err)
	}

	entries := parseICO(t, data)
	dib := data[entries[0].Offset : entries[0].Offset+entries[0].Bytes]
	// A DIB starts at the bottom row, and each pixel is stored B, G, R, A.
	if got, want := dib[40:44], []byte{60, 50, 40, 255}; !bytes.Equal(got, want) {
		t.Fatalf("first stored pixel = %v, want the bottom-left one as %v", got, want)
	}
	if got, want := dib[44:48], []byte{90, 80, 70, 255}; !bytes.Equal(got, want) {
		t.Fatalf("second stored pixel = %v, want the bottom-right one as %v", got, want)
	}
	if got, want := dib[48:52], []byte{30, 20, 10, 255}; !bytes.Equal(got, want) {
		t.Fatalf("third stored pixel = %v, want the top-left one as %v", got, want)
	}
}

func TestRunTargetsReportsAnEncodeFailure(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)
	bad := []iconTarget{{Path: "build/broken.ico", Sizes: []int{999}}}

	var out, errOut bytes.Buffer
	err := runTargets(root, bad, false, &out, &errOut)

	if err == nil {
		t.Fatal("runTargets accepted a target with an unencodable size")
	}
	if !strings.Contains(errOut.String(), "build/broken.ico") {
		t.Fatalf("stderr does not name the failing target: %s", errOut.String())
	}
}

func TestRunTargetsReportsAWriteFailure(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)
	// A directory sitting where the icon belongs makes the write fail without
	// depending on filesystem permissions, which differ across platforms.
	blocked := filepath.Join(root, "build", "blocked.ico")
	if err := os.MkdirAll(blocked, 0o755); err != nil {
		t.Fatalf("create blocking directory: %v", err)
	}

	var out, errOut bytes.Buffer
	err := runTargets(root, []iconTarget{{Path: "build/blocked.ico", Sizes: []int{16}}}, false, &out, &errOut)

	if err == nil {
		t.Fatal("runTargets reported success when the target could not be written")
	}
	if !strings.Contains(errOut.String(), "build/blocked.ico") {
		t.Fatalf("stderr does not name the unwritable target: %s", errOut.String())
	}
}

func TestRunTargetsCreatesAMissingParentDirectory(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)

	var out, errOut bytes.Buffer
	target := iconTarget{Path: "some/deep/new/place/icon.ico", Sizes: []int{16}}
	if err := runTargets(root, []iconTarget{target}, false, &out, &errOut); err != nil {
		t.Fatalf("runTargets: %v (stderr=%s)", err, errOut.String())
	}

	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(target.Path))); err != nil {
		t.Fatalf("target was not written into the new directory: %v", err)
	}
}

func TestRunReportsAMasterThatIsNotAPNG(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "build"), 0o755); err != nil {
		t.Fatalf("create build dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, masterPath), []byte("not a png"), 0o644); err != nil {
		t.Fatalf("write master: %v", err)
	}

	var out, errOut bytes.Buffer
	err := run(root, false, &out, &errOut)

	if err == nil {
		t.Fatal("run accepted a master that is not a PNG")
	}
	if !strings.Contains(errOut.String(), masterPath) {
		t.Fatalf("stderr does not name the master: %s", errOut.String())
	}
}

func TestRunAnnouncesEachGeneratedTarget(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)

	var out, errOut bytes.Buffer
	if err := run(root, false, &out, &errOut); err != nil {
		t.Fatalf("run: %v", err)
	}

	for _, target := range targets {
		if !strings.Contains(out.String(), target.Path) {
			t.Fatalf("stdout does not mention %s: %s", target.Path, out.String())
		}
	}
}

func TestRunAnnouncesTheNumberOfVerifiedTargets(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)
	list := []iconTarget{
		{Path: "build/one.ico", Sizes: []int{16}},
		{Path: "build/two.ico", Sizes: []int{16, 32}},
	}

	var out, errOut bytes.Buffer
	if err := runTargets(root, list, false, &out, &errOut); err != nil {
		t.Fatalf("generate: %v", err)
	}
	out.Reset()
	if err := runTargets(root, list, true, &out, &errOut); err != nil {
		t.Fatalf("check: %v (stderr=%s)", err, errOut.String())
	}

	if !strings.Contains(out.String(), "2 icon targets") {
		t.Fatalf("check summary counted the wrong number of targets: %s", out.String())
	}
}

func TestRunInCheckModeNamesEveryDriftedTarget(t *testing.T) {
	root := t.TempDir()
	writeMaster(t, root)
	list := []iconTarget{
		{Path: "build/one.ico", Sizes: []int{16}},
		{Path: "build/two.ico", Sizes: []int{32}},
	}

	var out, errOut bytes.Buffer
	if err := runTargets(root, list, false, &out, &errOut); err != nil {
		t.Fatalf("generate: %v", err)
	}
	for _, target := range list {
		path := filepath.Join(root, filepath.FromSlash(target.Path))
		if err := os.WriteFile(path, []byte("stale"), 0o644); err != nil {
			t.Fatalf("corrupt %s: %v", target.Path, err)
		}
	}

	errOut.Reset()
	if err := runTargets(root, list, true, &out, &errOut); err == nil {
		t.Fatal("check mode passed with both targets drifted")
	}
	// Reporting only the first would leave the second regeneration a surprise.
	for _, target := range list {
		if !strings.Contains(errOut.String(), target.Path) {
			t.Fatalf("stderr omits the drifted target %s: %s", target.Path, errOut.String())
		}
	}
}

func TestClampToByteSaturatesAtBothEnds(t *testing.T) {
	cases := []struct {
		in   float64
		want uint8
	}{
		{-10, 0}, {-0.4, 0}, {0, 0}, {0.5, 1}, {127.5, 128},
		{254.4, 254}, {255, 255}, {300, 255},
	}
	for _, c := range cases {
		if got := clampToByte(c.in); got != c.want {
			t.Fatalf("clampToByte(%v) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestOverlapMeasuresSharedInterval(t *testing.T) {
	cases := []struct {
		a0, a1, b0, b1, want float64
	}{
		{0, 1, 0, 1, 1},
		{0, 1, 0.5, 2, 0.5},
		{0, 1, 1, 2, 0},
		{0, 1, 2, 3, 0},
		{2, 3, 0, 1, 0},
		{1, 4, 2, 3, 1},
	}
	for _, c := range cases {
		if got := overlap(c.a0, c.a1, c.b0, c.b1); got != c.want {
			t.Fatalf("overlap(%v,%v,%v,%v) = %v, want %v", c.a0, c.a1, c.b0, c.b1, got, c.want)
		}
	}
}
