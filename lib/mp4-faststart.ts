/**
 * Pure Node.js MP4 faststart — moves the moov box before mdat so video
 * players can begin playback without downloading the full file.
 *
 * Equivalent to `ffmpeg -movflags +faststart` or `qt-faststart`.
 * Works entirely in-memory so it is suitable for videos up to ~200 MB.
 */

interface Box {
  type: string
  offset: number
  size: number      // total byte size including header
  headerSize: number // 8 (normal) or 16 (largesize, when size32 === 1)
}

function parseBox(buf: Buffer, offset: number): Box | null {
  if (offset + 8 > buf.length) return null

  const size32 = buf.readUInt32BE(offset)
  const type = buf.subarray(offset + 4, offset + 8).toString("ascii")

  if (size32 === 1) {
    // 64-bit extended size field follows the type
    if (offset + 16 > buf.length) return null
    const hi = buf.readUInt32BE(offset + 8)
    const lo = buf.readUInt32BE(offset + 12)
    const size64 = hi * 0x1_0000_0000 + lo
    return { type, offset, size: size64, headerSize: 16 }
  }

  if (size32 === 0) {
    // Box extends to the end of file
    return { type, offset, size: buf.length - offset, headerSize: 8 }
  }

  if (size32 < 8) return null // malformed

  return { type, offset, size: size32, headerSize: 8 }
}

/** Walk all top-level boxes and return their descriptors. */
function parseTopLevel(buf: Buffer): Box[] {
  const boxes: Box[] = []
  let pos = 0
  while (pos < buf.length) {
    const box = parseBox(buf, pos)
    if (!box) break
    boxes.push(box)
    pos += box.size
  }
  return boxes
}

const CONTAINER_TYPES = new Set([
  "moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta",
  "meta", "ilst", "moof", "traf", "mvex",
])

/**
 * Walk a moov buffer recursively and shift all `stco` / `co64` chunk
 * offsets by `delta` bytes (positive = forward, negative = backward).
 */
function shiftChunkOffsets(moov: Buffer, delta: number): Buffer {
  const out = Buffer.from(moov) // mutable copy

  function walk(buf: Buffer, start: number, end: number): void {
    let pos = start
    while (pos + 8 <= end) {
      const box = parseBox(buf, pos)
      if (!box || pos + box.size > end) break

      const dataOffset = pos + box.headerSize // first byte after the box header

      if (box.type === "stco") {
        // FullBox: version(1) + flags(3) + entry_count(4) + entries(4 each)
        const count = out.readUInt32BE(dataOffset + 4)
        for (let i = 0; i < count; i++) {
          const idx = dataOffset + 8 + i * 4
          const old = out.readUInt32BE(idx)
          out.writeUInt32BE(old + delta, idx)
        }
      } else if (box.type === "co64") {
        // 64-bit variant
        const count = out.readUInt32BE(dataOffset + 4)
        for (let i = 0; i < count; i++) {
          const idx = dataOffset + 8 + i * 8
          const hi = out.readUInt32BE(idx)
          const lo = out.readUInt32BE(idx + 4)
          const old = hi * 0x1_0000_0000 + lo
          const updated = old + delta
          out.writeUInt32BE(Math.floor(updated / 0x1_0000_0000), idx)
          out.writeUInt32BE(updated >>> 0, idx + 4)
        }
      } else if (CONTAINER_TYPES.has(box.type)) {
        walk(buf, dataOffset, pos + box.size)
      }

      pos += box.size
    }
  }

  walk(out, 0, out.length)
  return out
}

/**
 * Apply MP4 faststart to an in-memory buffer.
 *
 * Returns the original buffer unchanged if:
 * - moov is already before mdat (already fast-start)
 * - moov or mdat is missing (can't process)
 * - The buffer is too small to be a valid MP4
 */
export function mp4Faststart(input: Buffer): Buffer {
  if (input.length < 16) return input

  const boxes = parseTopLevel(input)
  const moov = boxes.find((b) => b.type === "moov")
  const firstMdat = boxes.find((b) => b.type === "mdat")

  if (!moov || !firstMdat) return input             // can't process
  if (moov.offset < firstMdat.offset) return input  // already faststart

  // Split boxes into three groups:
  //   A = non-moov, non-mdat boxes that come before mdat  (e.g. ftyp, free)
  //   M = moov
  //   D = all mdat boxes (and anything after them)
  const groupA: Box[] = []
  const groupD: Box[] = []

  for (const b of boxes) {
    if (b.type === "moov") continue
    if (b.type === "mdat" || b.offset > moov.offset) {
      groupD.push(b)
    } else {
      groupA.push(b)
    }
  }

  // New layout: [A boxes][updated moov][D boxes]
  //
  // The chunk offsets inside moov reference absolute byte positions of media
  // data inside the mdat box(es).  When we reorder, mdat shifts RIGHT by the
  // size of the moov box (it now has moov sitting before it).  So the delta
  // to add to every stco/co64 entry is:
  //
  //   newMdatOffset - oldMdatOffset
  //   = (sizeA + moov.size) - firstMdat.offset
  //
  const sizeA = groupA.reduce((s, b) => s + b.size, 0)
  const newMdatOffset = sizeA + moov.size
  const delta = newMdatOffset - firstMdat.offset  // positive: mdat moves right

  // Update chunk offsets inside the moov copy
  const moovSlice = input.subarray(moov.offset, moov.offset + moov.size)
  const updatedMoov = shiftChunkOffsets(moovSlice, delta)

  // Reassemble
  const parts: Buffer[] = [
    ...groupA.map((b) => input.subarray(b.offset, b.offset + b.size)),
    updatedMoov,
    ...groupD.map((b) => input.subarray(b.offset, b.offset + b.size)),
  ]

  return Buffer.concat(parts)
}

/** Returns true if the buffer looks like an MP4 / MOV container. */
export function isMP4Buffer(buf: Buffer): boolean {
  if (buf.length < 12) return false
  const type = buf.subarray(4, 8).toString("ascii")
  return ["ftyp", "moov", "mdat", "free", "skip", "wide"].includes(type)
}
