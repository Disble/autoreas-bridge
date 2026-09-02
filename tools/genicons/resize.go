package main

import (
	"image"
	"image/color"
	"math"
)

// resizeArea downsamples src to dstW x dstH with an area-average filter.
//
// Area averaging is the correct antialiasing filter for the ratios this tool
// works at (1024 down to 16 is 64:1); a sharpening kernel like Lanczos would
// ring on the mark's hairline stroke tips instead of resolving them.
//
// Averaging happens in premultiplied alpha so a transparent pixel contributes
// its transparency without dragging its colour into the result.
func resizeArea(src *image.NRGBA, dstW int, dstH int) *image.NRGBA {
	dst := image.NewNRGBA(image.Rect(0, 0, dstW, dstH))
	bounds := src.Bounds()
	srcW, srcH := bounds.Dx(), bounds.Dy()

	// No degenerate-size guard here on purpose: mutation testing showed one was
	// unreachable. A zero destination leaves both loops empty, and a zero source
	// makes every sample box empty, so averageBox returns transparent — which is
	// what a guard would have returned anyway. The scale below can divide by
	// zero, but only into a +Inf that the empty loop never reads.
	scaleX := float64(srcW) / float64(dstW)
	scaleY := float64(srcH) / float64(dstH)

	for dy := range dstH {
		y0 := float64(dy) * scaleY
		y1 := y0 + scaleY
		for dx := range dstW {
			x0 := float64(dx) * scaleX
			x1 := x0 + scaleX
			dst.SetNRGBA(dx, dy, averageBox(src, bounds, x0, x1, y0, y1))
		}
	}
	return dst
}

// averageBox averages the source pixels covered by [x0,x1) x [y0,y1).
func averageBox(src *image.NRGBA, bounds image.Rectangle, x0, x1, y0, y1 float64) color.NRGBA {
	var sumR, sumG, sumB, sumA, weight float64

	for sy := int(math.Floor(y0)); sy < int(math.Ceil(y1)); sy++ {
		if sy < 0 || sy >= bounds.Dy() {
			continue
		}
		// No zero-weight skip: the loop runs over exactly the rows and columns
		// the box touches, so every overlap here is positive. A guard for it was
		// unreachable, and a zero weight would contribute nothing regardless.
		wy := overlap(float64(sy), float64(sy+1), y0, y1)
		for sx := int(math.Floor(x0)); sx < int(math.Ceil(x1)); sx++ {
			if sx < 0 || sx >= bounds.Dx() {
				continue
			}
			wx := overlap(float64(sx), float64(sx+1), x0, x1)
			w := wx * wy
			p := src.NRGBAAt(bounds.Min.X+sx, bounds.Min.Y+sy)
			alpha := float64(p.A) / 255.0
			sumR += float64(p.R) * alpha * w
			sumG += float64(p.G) * alpha * w
			sumB += float64(p.B) * alpha * w
			sumA += float64(p.A) * w
			weight += w
		}
	}

	if weight <= 0 {
		return color.NRGBA{}
	}
	avgA := sumA / weight
	if avgA <= 0 {
		return color.NRGBA{}
	}
	// Undo the premultiplication against the *unrounded* average alpha, so a
	// fully opaque source colour survives a partially transparent neighbour.
	scale := 255.0 / avgA / weight
	return color.NRGBA{
		R: clampToByte(sumR * scale),
		G: clampToByte(sumG * scale),
		B: clampToByte(sumB * scale),
		A: clampToByte(avgA),
	}
}

// overlap returns the length shared by two half-open intervals.
func overlap(a0, a1, b0, b1 float64) float64 {
	return math.Max(0, math.Min(a1, b1)-math.Max(a0, b0))
}

// clampToByte rounds a channel value into the 0-255 range.
func clampToByte(v float64) uint8 {
	r := math.Round(v)
	if r <= 0 {
		return 0
	}
	if r >= 255 {
		return 255
	}
	return uint8(r)
}

// toNRGBA normalises any decoded image into the NRGBA form the tool works in.
func toNRGBA(src image.Image) *image.NRGBA {
	if already, ok := src.(*image.NRGBA); ok {
		return already
	}
	bounds := src.Bounds()
	out := image.NewNRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	for y := range bounds.Dy() {
		for x := range bounds.Dx() {
			r, g, b, a := src.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			if a == 0 {
				continue
			}
			out.SetNRGBA(x, y, color.NRGBA{
				R: uint8(r * 0xffff / a >> 8),
				G: uint8(g * 0xffff / a >> 8),
				B: uint8(b * 0xffff / a >> 8),
				A: uint8(a >> 8),
			})
		}
	}
	return out
}
