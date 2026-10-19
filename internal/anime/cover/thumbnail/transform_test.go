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

// TestTransformResizeReceiptsArePinnedToSpecVersionTwo pins the served bytes and ETag of the two resampler compositions v2 uses -- Box pre-shrink followed by CatmullRom, and the CatmullRom-only path -- because the measured composition in ADR-024 has no independent oracle: no stdlib encoder reproduces it. The policy itself (quality and geometry) is proven from derived evidence in TestTransformEncodesAtQualityEightyFive and TestTransformFitsHeightWithoutUpscaling, so a rule change must bump SpecVersion (design D4).
func TestTransformResizeReceiptsArePinnedToSpecVersionTwo(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		source     []byte
		wantSHA256 string
	}{
		{name: "pre-shrink engaged", source: encode(t, gradientImage(1000, 1000), "png"), wantSHA256: "76b6120293d03aa7eb3889c9d9957dc3ad33bbf5ae60442d177fc6d126ede30a"},
		{name: "pre-shrink skipped", source: encode(t, gradientImage(1001, 640), "png"), wantSHA256: "586df4f87fd8c0731440317745e830b368b654010d7a1d85cda8175d7897ddb3"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := thumbnail.Transform(tc.source, thumbnail.Options{})
			if err != nil {
				t.Fatalf("Transform: %v", err)
			}
			sum := sha256.Sum256(result.Bytes)
			gotSHA256, wantETag := hex.EncodeToString(sum[:]), `"`+hex.EncodeToString(sum[:])+`"`
			if gotSHA256 != tc.wantSHA256 || result.ETag != wantETag {
				t.Fatalf("served %d bytes sha256 %s ETag %s, want sha256 %s ETag %s", len(result.Bytes), gotSHA256, result.ETag, tc.wantSHA256, wantETag)
			}
		})
	}
}

// TestTransformEncodesAtQualityEightyFive proves every served JPEG declares exactly the quantization tables the standard library assigns to quality 85 -- and none of the previously served quality 80 tables -- so a small JPEG is re-encoded instead of passed through byte-for-byte.
func TestTransformEncodesAtQualityEightyFive(t *testing.T) {
	t.Parallel()

	probe := solidImage(8, 8, color.NRGBA{R: 120, G: 130, B: 140, A: 255})
	want85 := jpegQuantizationTables(t, encodeAtQuality(t, probe, 85))
	if bytes.Equal(want85, jpegQuantizationTables(t, encodeAtQuality(t, probe, 80))) {
		t.Fatal("fixture invalid: the standard library must use different quantization tables for quality 85 and 80")
	}

	cases := []struct {
		name   string
		source []byte
	}{
		{name: "a small JPEG is re-encoded instead of passed through", source: encode(t, solidImage(150, 180, color.NRGBA{R: 200, G: 20, B: 20, A: 255}), "jpeg")},
		{name: "an oversized source is encoded at the same quality", source: encode(t, gradientImage(1000, 1000), "png")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := thumbnail.Transform(tc.source, thumbnail.Options{})
			if err != nil {
				t.Fatalf("Transform: %v", err)
			}
			got := jpegQuantizationTables(t, result.Bytes)
			if !bytes.Equal(got, want85) {
				t.Fatalf("served quantization tables = %x, want the quality 85 tables %x", got, want85)
			}
		})
	}
}

// TestTransformFitsHeightWithoutUpscaling proves the height-480 ceiling: a source at the bound keeps its native size, a source one pixel over is proportionally downsized, a source below it is never upscaled, a degenerate one-pixel-wide result stays one pixel wide, the Box pre-shrink path is reachable, and a WebP source decodes.
func TestTransformFitsHeightWithoutUpscaling(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		data  []byte
		wantW int
		wantH int
	}{
		{name: "tall JPEG fits height 480", data: encode(t, solidImage(600, 900, color.NRGBA{R: 10, G: 200, B: 30, A: 255}), "jpeg"), wantW: 320, wantH: 480},
		{name: "exactly at the bound keeps its native height", data: encode(t, solidImage(213, 480, color.NRGBA{R: 60, G: 30, B: 10, A: 255}), "jpeg"), wantW: 213, wantH: 480},
		{name: "one pixel over the bound is downsized", data: encode(t, solidImage(600, 481, color.NRGBA{R: 30, G: 60, B: 90, A: 255}), "png"), wantW: 598, wantH: 480},
		{name: "short PNG keeps its height", data: encode(t, solidImage(140, 200, color.NRGBA{R: 5, G: 5, B: 200, A: 255}), "png"), wantW: 140, wantH: 200},
		{name: "square source engages the Box pre-shrink", data: encode(t, gradientImage(1000, 1000), "png"), wantW: 480, wantH: 480},
		{name: "one-pixel-wide source clamps to width one", data: encode(t, solidImage(1, 1000, color.NRGBA{R: 7, G: 7, B: 7, A: 255}), "png"), wantW: 1, wantH: 480},
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

// encodeAtQuality encodes img as a JPEG at quality, failing the test immediately on any encode error.
func encodeAtQuality(t *testing.T, img image.Image, quality int) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
		t.Fatalf("encode JPEG at quality %d: %v", quality, err)
	}
	return buf.Bytes()
}

// jpegQuantizationTables returns the concatenated payloads of every DQT segment in data; the standard library maps a quality value to those tables and nothing else, so comparing them proves the encoder quality without pinning bytes or mirroring the pipeline.
func jpegQuantizationTables(t *testing.T, data []byte) []byte {
	t.Helper()
	if !bytes.HasPrefix(data, []byte{0xFF, 0xD8}) {
		t.Fatalf("not a JPEG: missing the SOI marker in %x", data[:min(len(data), 8)])
	}
	var tables []byte
	for i := 2; i+1 < len(data); {
		if data[i] != 0xFF {
			t.Fatalf("expected a JPEG marker at offset %d, found %#x", i, data[i])
		}
		marker := data[i+1]
		if marker == 0xD9 || marker == 0xDA { // end of image, or start of scan: no more header segments
			break
		}
		if i+4 > len(data) {
			t.Fatalf("truncated JPEG segment header at offset %d", i)
		}
		length := int(data[i+2])<<8 | int(data[i+3])
		if length < 2 || i+2+length > len(data) {
			t.Fatalf("invalid JPEG segment length %d for marker %#x at offset %d", length, marker, i)
		}
		if marker == 0xDB { // define quantization table
			tables = append(tables, data[i+4:i+2+length]...)
		}
		i += 2 + length
	}
	if len(tables) == 0 {
		t.Fatal("no quantization tables found: not a baseline JPEG header")
	}
	return tables
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
