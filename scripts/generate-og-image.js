/**
 * generate-og-image.js
 *
 * Zero-dependency Node.js script that writes a solid-colour PNG Open Graph
 * image for wieDoetHet. Uses only Node's built-in `zlib` and `fs` modules.
 *
 * Output:
 *   public/og-image.png  (1200×630, brand colour #2d9cdb)
 *
 * This produces a branded placeholder. Replace public/og-image.png with a
 * properly designed image (app name + tagline + logo) before launch.
 * Recommended tool: Figma export or any image editor at exactly 1200×630px.
 *
 * Usage:
 *   node scripts/generate-og-image.js
 */

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Brand colour #2d9cdb
const BRAND_HEX = '#2d9cdb'
const R = parseInt(BRAND_HEX.slice(1, 3), 16) // 45
const G = parseInt(BRAND_HEX.slice(3, 5), 16) // 156
const B = parseInt(BRAND_HEX.slice(5, 7), 16) // 219

// OG image dimensions (Facebook/WhatsApp/Slack recommended)
const WIDTH = 1200
const HEIGHT = 630

// ---------------------------------------------------------------------------
// PNG helpers (shared pattern with generate-icons.js)
// ---------------------------------------------------------------------------

function buildCrcTable() {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
}

const CRC_TABLE = buildCrcTable()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBytes, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf])
}

function buildIHDR(width, height) {
  const buf = Buffer.alloc(13)
  buf.writeUInt32BE(width, 0)
  buf.writeUInt32BE(height, 4)
  buf[8] = 8  // bit depth
  buf[9] = 2  // colour type: RGB truecolour
  buf[10] = 0 // compression method
  buf[11] = 0 // filter method
  buf[12] = 0 // interlace method
  return chunk('IHDR', buf)
}

function buildIDAT(width, height, red, green, blue) {
  // Each row: filter byte (0x00 = None) + width * 3 bytes RGB
  const rowSize = 1 + width * 3
  const raw = Buffer.alloc(height * rowSize)
  for (let y = 0; y < height; y++) {
    const offset = y * rowSize
    raw[offset] = 0x00 // filter type None
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3
      raw[px] = red
      raw[px + 1] = green
      raw[px + 2] = blue
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 })
  return chunk('IDAT', compressed)
}

function buildIEND() {
  return chunk('IEND', Buffer.alloc(0))
}

function makePng(width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    buildIHDR(width, height),
    buildIDAT(width, height, R, G, B),
    buildIEND(),
  ])
}

// ---------------------------------------------------------------------------
// Write file
// ---------------------------------------------------------------------------

const outPath = path.join(__dirname, '..', 'public', 'og-image.png')
fs.writeFileSync(outPath, makePng(WIDTH, HEIGHT))
console.log(`Written: ${outPath} (${WIDTH}x${HEIGHT}, ${BRAND_HEX})`)
console.log(
  'NOTE: Replace public/og-image.png with a properly designed image before launch.',
  '\n      Recommended: Figma export at 1200×630px with app name, tagline, and logo.',
)
