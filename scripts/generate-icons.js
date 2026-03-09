/**
 * generate-icons.js
 *
 * Zero-dependency Node.js script that writes solid-colour PNG icons for the
 * wieDoetHet PWA. Uses only Node's built-in `zlib` and `fs` modules.
 *
 * Output:
 *   public/icons/icon-192.png  (192×192, brand colour #2d9cdb)
 *   public/icons/icon-512.png  (512×512, brand colour #2d9cdb)
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Brand colour from src/style.css --color-brand-500
const BRAND_HEX = '#2d9cdb'
const r = parseInt(BRAND_HEX.slice(1, 3), 16) // 45
const g = parseInt(BRAND_HEX.slice(3, 5), 16) // 156
const b = parseInt(BRAND_HEX.slice(5, 7), 16) // 219

// ---------------------------------------------------------------------------
// PNG helpers
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

function makePng(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    buildIHDR(size, size),
    buildIDAT(size, size, r, g, b),
    buildIEND(),
  ])
}

// ---------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------

const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

const sizes = [192, 512]
for (const size of sizes) {
  const outPath = path.join(outDir, `icon-${size}.png`)
  fs.writeFileSync(outPath, makePng(size))
  console.log(`Written: ${outPath} (${size}x${size}, ${BRAND_HEX})`)
}

console.log('Done. Real artwork should be placed in public/icons/ before production launch.')
