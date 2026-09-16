package thumbnail_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"math"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime/cover/thumbnail"
)

// tinyWebPHex is a 4x6 lossless WebP (RIFF/VP8L), Pillow-generated and golang.org/x/image/webp-verified; embedded because Go has no WebP encoder.
const tinyWebPHex = "5249464622000000574542505650384c160000002f0340010007508a2ad4a3ff018020fc6f9b88e87f08"

// headerOnlyPNGAtCapHex and headerOnlyPNGOverCapHex declare 4096x4096 (exactly the cap) and 10000x10000 in their IHDR alone, proving the cap check runs from the header and admits exactly the cap; the zeroDimGIFHex values are header-only GIFs whose logical screen descriptor is 0x1, 1x0 and 10x1, which gif.DecodeConfig accepts (measured) but no other accepted decoder does.
const (
	headerOnlyPNGAtCapHex   = "89504e470d0a1a0a0000000d49484452000010000000100008020000007dc1b340"
	headerOnlyPNGOverCapHex = "89504e470d0a1a0a0000000d4948445200002710000027100802000000352cf570"
	zeroWidthGIFHex         = "474946383961000001000000003b"
	zeroHeightGIFHex        = "474946383961010000000000003b"
	heightOneGIFHex         = "4749463839610a0001000000003b"
)

// jpegMagic is the SOI-plus-marker prefix every JPEG this package serves carries.
var jpegMagic = []byte{0xFF, 0xD8, 0xFF}

// TestTransformServedBytesArePinnedToSpecVersionOne pins v1's exact served bytes and ETag for the Box pre-shrink path, the direct CatmullRom path, and both short-JPEG pass-through boundaries; a rule change here must bump SpecVersion (design D4).
func TestTransformServedBytesArePinnedToSpecVersionOne(t *testing.T) {
	t.Parallel()

	gray := color.NRGBA{R: 240, G: 240, B: 240, A: 255}
	cases := []struct {
		name       string
		source     []byte
		wantSHA256 string // empty means the served bytes must be the source bytes, so their own hash pins them
	}{
		{name: "pre-shrink engaged", source: encode(t, gradientImage(1000, 1000), "png"), wantSHA256: "73c11880865c5ce17cfcd2e0a51e993bed8dad8cc2f51c40fc5e6d4c3a80f294"},
		{name: "pre-shrink skipped", source: encode(t, gradientImage(1001, 640), "png"), wantSHA256: "21d52e2a88fbbd9efaa3c8b5cf17900d9e70c3c7ad6d532cb47bba2b395b4007"},
		{name: "pass-through shorter than the bound", source: encode(t, solidImage(150, 180, gray), "jpeg")},
		{name: "pass-through exactly at the bound", source: encode(t, solidImage(213, 320, gray), "jpeg")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := thumbnail.Transform(tc.source, thumbnail.Options{})
			if err != nil {
				t.Fatalf("Transform: %v", err)
			}
			served := result.Bytes
			if tc.wantSHA256 == "" {
				served = tc.source
			}
			sum := sha256.Sum256(served)
			gotSHA256, wantETag := hex.EncodeToString(sum[:]), `"`+hex.EncodeToString(sum[:])+`"`
			if !bytes.Equal(result.Bytes, served) || result.ETag != wantETag || (tc.wantSHA256 != "" && gotSHA256 != tc.wantSHA256) {
				t.Fatalf("served %d bytes sha256 %s ETag %s, want %x sha256 %s ETag %s", len(result.Bytes), gotSHA256, result.ETag, served, tc.wantSHA256, wantETag)
			}
		})
	}
}

// TestTransformFitsHeightWithoutUpscaling proves height-320 fit without upscaling, a degenerate one-pixel-wide result, and a decoded WebP source.
func TestTransformFitsHeightWithoutUpscaling(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		data  []byte
		wantW int
		wantH int
	}{
		{name: "tall JPEG fits height 320", data: encode(t, solidImage(600, 900, color.NRGBA{R: 10, G: 200, B: 30, A: 255}), "jpeg"), wantW: 213, wantH: 320},
		{name: "short PNG keeps its height", data: encode(t, solidImage(140, 200, color.NRGBA{R: 5, G: 5, B: 200, A: 255}), "png"), wantW: 140, wantH: 200},
		{name: "one-pixel-wide source clamps to width one", data: encode(t, solidImage(1, 1000, color.NRGBA{R: 7, G: 7, B: 7, A: 255}), "png"), wantW: 1, wantH: 320},
		{name: "WebP decodes and is not upscaled", data: mustHex(t, tinyWebPHex), wantW: 4, wantH: 6},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := thumbnail.Transform(tc.data, thumbnail.Options{})
			if err != nil {
				t.Fatalf("Transform: %v", err)
			}
			bounds := mustDecode(t, result.Bytes).Bounds()
			if !bytes.HasPrefix(result.Bytes, jpegMagic) || bounds.Dx() != tc.wantW || bounds.Dy() != tc.wantH {
				t.Fatalf("served bytes = %x bounds %dx%d, want a JPEG re-encode sized %dx%d", result.Bytes[:3], bounds.Dx(), bounds.Dy(), tc.wantW, tc.wantH)
			}
		})
	}
}

// TestTransformRejectsInvalidSources proves every rejection is ErrInvalidSource, and that only an over-cap header names "pixel cap" in its error.
func TestTransformRejectsInvalidSources(t *testing.T) {
	t.Parallel()

	truncated := encode(t, solidImage(150, 180, color.NRGBA{R: 100, G: 100, B: 100, A: 255}), "jpeg")
	truncated = truncated[:len(truncated)-8]
	if _, _, err := image.DecodeConfig(bytes.NewReader(truncated)); err != nil {
		t.Fatalf("fixture invalid: DecodeConfig must still succeed on the truncated header, got %v", err)
	}

	cases := []struct {
		name          string
		data          []byte
		wantCapReason bool
	}{
		{name: "truncated short JPEG", data: truncated},
		{name: "over the pixel cap from the header alone", data: mustHex(t, headerOnlyPNGOverCapHex), wantCapReason: true},
		{name: "exactly at the pixel cap is admitted past the cap check", data: mustHex(t, headerOnlyPNGAtCapHex)},
		{name: "zero-width GIF screen descriptor", data: mustHex(t, zeroWidthGIFHex), wantCapReason: true},
		{name: "zero-height GIF screen descriptor", data: mustHex(t, zeroHeightGIFHex), wantCapReason: true},
		{name: "height-one GIF screen descriptor", data: mustHex(t, heightOneGIFHex)},
		{name: "SVG", data: []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>`)},
		{name: "ICO", data: []byte{0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, 0x00, 0x00}},
		{name: "BMP", data: []byte{'B', 'M', 0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := thumbnail.Transform(tc.data, thumbnail.Options{})
			if !errors.Is(err, thumbnail.ErrInvalidSource) || strings.Contains(err.Error(), "pixel cap") != tc.wantCapReason {
				t.Fatalf("Transform() error = %v, want ErrInvalidSource naming pixel-cap=%v", err, tc.wantCapReason)
			}
		})
	}
}

// TestTransformCompositesOntoAnOpaqueBackground proves alpha flattens onto the default or a caller-supplied opaque color, and that a multi-frame GIF keeps only its first frame.
func TestTransformCompositesOntoAnOpaqueBackground(t *testing.T) {
	t.Parallel()

	transparent := func() []byte { return encode(t, image.NewNRGBA(image.Rect(0, 0, 8, 8)), "png") }
	cases := []struct {
		name string
		data []byte
		opts thumbnail.Options
		want color.NRGBA
	}{
		{name: "default background", data: transparent(), want: color.NRGBA{R: 0x1B, G: 0x26, B: 0x36, A: 255}},
		{name: "caller-supplied background", data: transparent(), opts: thumbnail.Options{Background: color.NRGBA{R: 200, G: 10, B: 10, A: 255}}, want: color.NRGBA{R: 200, G: 10, B: 10, A: 255}},
		{name: "first GIF frame only", data: encode(t, nil, "gif"), want: color.NRGBA{R: 255, A: 255}}, // frame one is red, frame two (ignored) is blue.
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := thumbnail.Transform(tc.data, tc.opts)
			if err != nil {
				t.Fatalf("Transform: %v", err)
			}
			img := mustDecode(t, result.Bytes)
			bounds := img.Bounds()
			cr, cg, cb, _ := img.At(bounds.Min.X+bounds.Dx()/2, bounds.Min.Y+bounds.Dy()/2).RGBA()
			r, g, b := float64(cr>>8), float64(cg>>8), float64(cb>>8)
			const tolerance = 12.0 // JPEG re-encoding noise
			if math.Abs(r-float64(tc.want.R)) > tolerance || math.Abs(g-float64(tc.want.G)) > tolerance || math.Abs(b-float64(tc.want.B)) > tolerance {
				t.Fatalf("center pixel = (%.1f,%.1f,%.1f), want close to (%d,%d,%d)", r, g, b, tc.want.R, tc.want.G, tc.want.B)
			}
		})
	}
}

// solidImage builds an opaque w x h image filled with c.
func solidImage(w, h int, c color.NRGBA) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), image.NewUniform(c), image.Point{}, draw.Src)
	return img
}

// gradientImage builds a deterministic diagonal color ramp so a resampler or quality change is observable in the served bytes.
func gradientImage(w, h int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(x % 256), G: uint8(y % 256), B: uint8((x + y) % 256), A: 255})
		}
	}
	return img
}

// encode builds image bytes as PNG ("png"), quality-95 JPEG ("jpeg"), or a 2-frame 40x20 red-then-blue GIF ("gif", ignoring img), failing the test on any encode error.
func encode(t *testing.T, img image.Image, format string) []byte {
	t.Helper()
	var buf bytes.Buffer
	var err error
	switch format {
	case "png":
		err = png.Encode(&buf, img)
	case "jpeg":
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95})
	case "gif":
		palette := color.Palette{color.RGBA{R: 255, A: 255}, color.RGBA{B: 255, A: 255}}
		red := image.NewPaletted(image.Rect(0, 0, 40, 20), palette)
		blue := image.NewPaletted(image.Rect(0, 0, 40, 20), palette)
		draw.Draw(blue, blue.Bounds(), image.NewUniform(palette[1]), image.Point{}, draw.Src)
		err = gif.EncodeAll(&buf, &gif.GIF{Image: []*image.Paletted{red, blue}, Delay: []int{0, 0}})
	default:
		t.Fatalf("unknown encode format %q", format)
	}
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	return buf.Bytes()
}

// mustHex decodes a hex fixture constant or fails the test immediately.
func mustHex(t *testing.T, s string) []byte {
	t.Helper()
	data, err := hex.DecodeString(s)
	if err != nil {
		t.Fatalf("decode fixture hex: %v", err)
	}
	return data
}

// mustDecode decodes data as an image or fails the test immediately.
func mustDecode(t *testing.T, data []byte) image.Image {
	t.Helper()
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("decode result: %v", err)
	}
	return img
}
