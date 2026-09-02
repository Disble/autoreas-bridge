package main

import (
	"image"
	"image/color"
	"testing"
)

// gridNRGBA builds an opaque image whose red channel carries the given grid.
func gridNRGBA(rows [][]uint8) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, len(rows[0]), len(rows)))
	for y, row := range rows {
		for x, v := range row {
			img.SetNRGBA(x, y, color.NRGBA{R: v, G: v, B: v, A: 255})
		}
	}
	return img
}

func TestAverageBoxIgnoresColumnsAndRowsBeforeTheImage(t *testing.T) {
	src := gridNRGBA([][]uint8{
		{100, 200},
		{200, 200},
	})

	// The box starts a whole pixel above and left of the image. Without the
	// bounds guard this indexes out of range instead of clipping.
	got := averageBox(src, src.Bounds(), -1, 1, -1, 1)

	if got.R != 100 {
		t.Fatalf("red = %d, want 100 — only the top-left pixel is inside the box", got.R)
	}
	if got.A != 255 {
		t.Fatalf("alpha = %d, want 255", got.A)
	}
}

func TestAverageBoxIgnoresColumnsAndRowsPastTheImage(t *testing.T) {
	src := gridNRGBA([][]uint8{
		{200, 200},
		{200, 90},
	})

	got := averageBox(src, src.Bounds(), 1, 3, 1, 3)

	if got.R != 90 {
		t.Fatalf("red = %d, want 90 — only the bottom-right pixel is inside the box", got.R)
	}
}

func TestAverageBoxReturnsNothingForABoxEntirelyOutsideTheImage(t *testing.T) {
	src := gridNRGBA([][]uint8{{10, 20}, {30, 40}})

	got := averageBox(src, src.Bounds(), 5, 7, 5, 7)

	if got != (color.NRGBA{}) {
		t.Fatalf("pixel = %+v, want the zero value", got)
	}
}

func TestAverageBoxWeightsAPartiallyCoveredEdgePixel(t *testing.T) {
	src := gridNRGBA([][]uint8{
		{0, 100},
		{0, 100},
	})

	// x spans [0.5, 1.5): half of column 0 and half of column 1.
	got := averageBox(src, src.Bounds(), 0.5, 1.5, 0, 1)

	if got.R != 50 {
		t.Fatalf("red = %d, want 50 — the two columns are covered equally", got.R)
	}
}

func TestToNRGBAConvertsEachChannelIndependently(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 1, 1))
	// Premultiplied at half alpha: straight colour is (200, 100, 60).
	src.SetRGBA(0, 0, color.RGBA{R: 100, G: 50, B: 30, A: 128})

	got := toNRGBA(src).NRGBAAt(0, 0)

	// Literals rather than arithmetic on the source, so a mutated unpremultiply
	// cannot agree with the expectation by sharing its formula.
	want := color.NRGBA{R: 199, G: 99, B: 59, A: 128}
	if got != want {
		t.Fatalf("pixel = %+v, want %+v", got, want)
	}
}

func TestEncodeICOAcceptsTheSmallestAddressableSize(t *testing.T) {
	master := gridNRGBA([][]uint8{{10, 20}, {30, 40}})

	data, err := encodeICO(master, []int{1})
	if err != nil {
		t.Fatalf("encodeICO rejected a 1px entry: %v", err)
	}

	entries := parseICO(t, data)
	if entries[0].Width != 1 || entries[0].Height != 1 {
		t.Fatalf("entry dims = %dx%d, want 1x1", entries[0].Width, entries[0].Height)
	}
}

func TestEncodeICOPadsTheANDMaskToAFourByteStridePerSize(t *testing.T) {
	master := gridNRGBA([][]uint8{{10, 20}, {30, 40}})

	// A 1bpp mask row is padded up to a 4-byte boundary. 32px needs one 4-byte
	// group per row, 48px and 64px need two. Sizes chosen because they are the
	// ones where an off-by-one in the padding formula changes the answer.
	cases := []struct {
		size       int
		maskStride int
	}{
		{16, 4}, {24, 4}, {32, 4}, {48, 8}, {64, 8},
	}
	for _, c := range cases {
		data, err := encodeICO(master, []int{c.size})
		if err != nil {
			t.Fatalf("encodeICO(%d): %v", c.size, err)
		}
		entries := parseICO(t, data)
		want := dibHeaderBytes + c.size*c.size*4 + c.maskStride*c.size
		if int(entries[0].Bytes) != want {
			t.Fatalf("%dpx DIB is %d bytes, want %d (mask stride %d)",
				c.size, entries[0].Bytes, want, c.maskStride)
		}
	}
}

func TestEncodeICOPlacesEveryPayloadAtItsDeclaredOffset(t *testing.T) {
	master := gridNRGBA([][]uint8{{10, 20}, {30, 40}})
	sizes := []int{16, 32, 128}

	data, err := encodeICO(master, sizes)
	if err != nil {
		t.Fatalf("encodeICO: %v", err)
	}

	entries := parseICO(t, data)
	// The first payload starts right after the directory, and each following one
	// starts where the previous ended. A wrong offset still produces a plausible
	// file that Windows renders as garbage.
	want := uint32(6 + 16*len(sizes))
	for i, e := range entries {
		if e.Offset != want {
			t.Fatalf("entry %d offset = %d, want %d", i, e.Offset, want)
		}
		want += e.Bytes
	}
	if int(want) != len(data) {
		t.Fatalf("payloads end at %d but the file is %d bytes", want, len(data))
	}
}
