// Package thumbnail is the pure anime-cover-thumbnails v1 transform: source bytes in, served JPEG bytes and a precomputed strong ETag out, with no filesystem/HTTP/cache/semaphore/desktop dependency (design D3).
package thumbnail

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// SpecVersion is the fixed thumbnail spec version this package implements; a rule change here must bump it (design D4).
const SpecVersion = 1

const (
	maxHeight    = 320
	maxPixels    = 16_777_216
	jpegQuality  = 80
	preShrinkMax = 2
)

// ErrInvalidSource classifies every Transform rejection: an unsupported/undecodable format, or a source over the pixel cap.
var ErrInvalidSource = errors.New("thumbnail: invalid source")

// defaultBackground is the bridge's existing opaque UI background (internal/desktop/options.go's RGB(27, 38, 54), #1B2636).
var defaultBackground = color.NRGBA{R: 0x1B, G: 0x26, B: 0x36, A: 0xFF}

// acceptedFormats are the only image.Decode-registered formats v1 serves; ICO, SVG, BMP, and any other image/* bytes have no matching decoder here.
var acceptedFormats = map[string]bool{"jpeg": true, "png": true, "gif": true, "webp": true}

// boxKernel reproduces a uniform-weight box filter: x/image/draw exports no named Box scaler, so this rebuilds one via the generic Kernel type.
var boxKernel = &draw.Kernel{Support: 0.5, At: func(float64) float64 { return 1 }}

// Options configures one Transform call. A nil Background uses defaultBackground.
type Options struct {
	Background color.Color
}

// Result is a served thumbnail and its precomputed strong ETag.
type Result struct {
	Bytes []byte
	ETag  string
}

// Transform rejects an unsupported format or over-cap source before a full decode, serves an already-small proven-valid JPEG byte-for-byte, and otherwise flattens/resizes/encodes per design D3.
func Transform(data []byte, opts Options) (Result, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return Result{}, fmt.Errorf("%w: decode config: %w", ErrInvalidSource, err)
	}
	if !acceptedFormats[format] {
		return Result{}, fmt.Errorf("%w: unsupported format %q", ErrInvalidSource, format)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxPixels {
		return Result{}, fmt.Errorf("%w: pixel cap exceeded", ErrInvalidSource)
	}

	if format == "jpeg" && cfg.Height <= maxHeight {
		// Prove the bytes fully decode before serving them unchanged, so a truncated/corrupt short JPEG is rejected instead of served (design D3.2).
		if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
			return Result{}, fmt.Errorf("%w: decode: %w", ErrInvalidSource, err)
		}
		return newResult(data), nil
	}

	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return Result{}, fmt.Errorf("%w: decode: %w", ErrInvalidSource, err)
	}
	bg := opts.Background
	if bg == nil {
		bg = defaultBackground
	}
	return generate(src, cfg.Width, cfg.Height, bg)
}

// generate flattens src over bg, resizes to the never-upscaled height-320 fit, and encodes the result as JPEG q80 (design D3.4-D3.5).
func generate(src image.Image, srcW, srcH int, bg color.Color) (Result, error) {
	targetW, targetH := fitDimensions(srcW, srcH)
	resized := resize(flatten(src, bg), targetW, targetH)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, resized, &jpeg.Options{Quality: jpegQuality}); err != nil {
		return Result{}, fmt.Errorf("%w: encode: %w", ErrInvalidSource, err)
	}
	return newResult(buf.Bytes()), nil
}

// fitDimensions computes the never-upscaled height-320 target size.
func fitDimensions(srcW, srcH int) (w, h int) {
	h = srcH
	if h > maxHeight {
		h = maxHeight
	}
	w = srcW
	if h != srcH {
		w = srcW * h / srcH
		if w < 1 {
			w = 1
		}
	}
	return w, h
}

// flatten composites src over an opaque bg, discarding any alpha.
func flatten(src image.Image, bg color.Color) image.Image {
	bounds := src.Bounds()
	dst := image.NewRGBA(bounds)
	draw.Draw(dst, bounds, image.NewUniform(bg), image.Point{}, draw.Src)
	draw.Draw(dst, bounds, src, bounds.Min, draw.Over)
	return dst
}

// resize pre-shrinks with the Box kernel when oversized by more than preShrinkMax, then finishes with one precise CatmullRom pass to the exact target (both stages measured in ADR-024).
func resize(src image.Image, w, h int) image.Image {
	sb := src.Bounds()
	cur := src
	if sb.Dx() > w*preShrinkMax && sb.Dy() > h*preShrinkMax {
		tmp := image.NewRGBA(image.Rect(0, 0, w*preShrinkMax, h*preShrinkMax))
		boxKernel.Scale(tmp, tmp.Bounds(), src, sb, draw.Over, nil)
		cur = tmp
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(dst, dst.Bounds(), cur, cur.Bounds(), draw.Over, nil)
	return dst
}

// newResult computes served's precomputed quoted strong ETag (design D3.6).
func newResult(served []byte) Result {
	sum := sha256.Sum256(served)
	return Result{Bytes: served, ETag: fmt.Sprintf("%q", hex.EncodeToString(sum[:]))}
}
