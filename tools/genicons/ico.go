package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
)

const (
	// dibHeaderBytes is the size of a BITMAPINFOHEADER.
	dibHeaderBytes = 40
	// dirEntryBytes is the size of one ICONDIRENTRY.
	dirEntryBytes = 16
	// maxDIBSize is the largest entry still written as a bitmap.
	//
	// NSIS reads MUI_ICON entries as device-independent bitmaps, so every size
	// the installer might draw stays DIB. Above it the shell is the only
	// consumer and PNG compression keeps the file small.
	maxDIBSize = 64
)

// encodeICO renders master at each requested size into one ICO file.
func encodeICO(master image.Image, sizes []int) ([]byte, error) {
	if len(sizes) == 0 {
		return nil, fmt.Errorf("no sizes requested")
	}
	src := toNRGBA(master)

	payloads := make([][]byte, len(sizes))
	for i, size := range sizes {
		if size < 1 || size > 256 {
			return nil, fmt.Errorf("size %d is outside the 1-256 range an ICO can address", size)
		}
		resized := resizeArea(src, size, size)
		var payload []byte
		var err error
		if size <= maxDIBSize {
			payload = encodeDIB(resized, size)
		} else {
			payload, err = encodePNG(resized)
		}
		if err != nil {
			return nil, fmt.Errorf("encode %dpx entry: %w", size, err)
		}
		payloads[i] = payload
	}

	var out bytes.Buffer
	writeU16(&out, 0) // reserved
	writeU16(&out, 1) // type: icon
	writeU16(&out, uint16(len(sizes)))

	offset := uint32(6 + dirEntryBytes*len(sizes))
	for i, size := range sizes {
		// 256 does not fit in a byte, and the format spells that dimension as 0 —
		// which is exactly what truncating 256 to a byte produces. Sizes above
		// 256 were rejected above, so no explicit branch is needed and mutation
		// testing showed one to be unreachable.
		dim := byte(size)
		out.WriteByte(dim)
		out.WriteByte(dim)
		out.WriteByte(0) // palette size: none, this is a true-colour entry
		out.WriteByte(0) // reserved
		writeU16(&out, 1)
		writeU16(&out, 32)
		writeU32(&out, uint32(len(payloads[i])))
		writeU32(&out, offset)
		offset += uint32(len(payloads[i]))
	}
	for _, payload := range payloads {
		out.Write(payload)
	}
	return out.Bytes(), nil
}

// encodeDIB writes one bottom-up 32bpp bitmap entry plus its AND mask.
func encodeDIB(img *image.NRGBA, size int) []byte {
	maskStride := ((size + 31) / 32) * 4
	out := bytes.NewBuffer(make([]byte, 0, dibHeaderBytes+size*size*4+maskStride*size))

	writeU32(out, dibHeaderBytes)
	writeU32(out, uint32(size))
	// biHeight covers the colour rows and the mask rows stacked together.
	writeU32(out, uint32(size*2))
	writeU16(out, 1)
	writeU16(out, 32)
	writeU32(out, 0) // BI_RGB
	writeU32(out, uint32(size*size*4+maskStride*size))
	writeU32(out, 0) // biXPelsPerMeter
	writeU32(out, 0) // biYPelsPerMeter
	writeU32(out, 0) // biClrUsed
	writeU32(out, 0) // biClrImportant

	for y := size - 1; y >= 0; y-- {
		for x := range size {
			p := img.NRGBAAt(x, y)
			out.Write([]byte{p.B, p.G, p.R, p.A})
		}
	}

	// The AND mask is legacy but still parsed; a 1 marks a pixel the shell must
	// punch out when it ignores the alpha channel.
	row := make([]byte, maskStride)
	for y := size - 1; y >= 0; y-- {
		for i := range row {
			row[i] = 0
		}
		for x := range size {
			if img.NRGBAAt(x, y).A < 128 {
				row[x/8] |= 0x80 >> (x % 8)
			}
		}
		out.Write(row)
	}
	return out.Bytes()
}

// encodePNG writes one PNG-compressed entry.
func encodePNG(img *image.NRGBA) ([]byte, error) {
	var buf bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestCompression}
	if err := encoder.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// writeU16 appends a little-endian uint16, the byte order every ICO field uses.
func writeU16(w *bytes.Buffer, v uint16) {
	_ = binary.Write(w, binary.LittleEndian, v)
}

// writeU32 appends a little-endian uint32, the byte order every ICO field uses.
func writeU32(w *bytes.Buffer, v uint32) {
	_ = binary.Write(w, binary.LittleEndian, v)
}
