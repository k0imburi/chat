/**
 * Repair existing R2 objects that have:
 *  1. Wrong content-type (application/octet-stream instead of video/mp4 etc.)
 *  2. moov box at end of MP4 (slow-start, causes "GIF-like" playback)
 *
 * Rewrites each affected object in-place using a CopyObject (for content-type
 * only) or a full re-upload (for faststart rewrite).
 *
 * Run:
 *   DATABASE_URL="..." node scripts/fix-r2-videos.mjs
 */
import { PrismaClient } from "@prisma/client"
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3"
import mime from "mime-types"
import path from "node:path"

const prisma = new PrismaClient()

// ── Minimal MP4 faststart (same logic as lib/mp4-faststart.ts) ─────────────
function parseBox(buf, offset) {
  if (offset + 8 > buf.length) return null
  const size32 = buf.readUInt32BE(offset)
  const type = buf.subarray(offset + 4, offset + 8).toString("ascii")
  if (size32 === 1) {
    if (offset + 16 > buf.length) return null
    const hi = buf.readUInt32BE(offset + 8)
    const lo = buf.readUInt32BE(offset + 12)
    return { type, offset, size: hi * 0x1_0000_0000 + lo, headerSize: 16 }
  }
  if (size32 === 0) return { type, offset, size: buf.length - offset, headerSize: 8 }
  if (size32 < 8) return null
  return { type, offset, size: size32, headerSize: 8 }
}

function parseTopLevel(buf) {
  const boxes = []; let pos = 0
  while (pos < buf.length) {
    const b = parseBox(buf, pos)
    if (!b) break
    boxes.push(b); pos += b.size
  }
  return boxes
}

const CONTAINERS = new Set(["moov","trak","mdia","minf","stbl","edts","dinf","udta","meta","ilst","moof","traf","mvex"])

function shiftChunkOffsets(moov, delta) {
  const out = Buffer.from(moov)
  function walk(buf, start, end) {
    let pos = start
    while (pos + 8 <= end) {
      const b = parseBox(buf, pos)
      if (!b || pos + b.size > end) break
      const d = pos + b.headerSize
      if (b.type === "stco") {
        const n = out.readUInt32BE(d + 4)
        for (let i = 0; i < n; i++) {
          const idx = d + 8 + i * 4
          out.writeUInt32BE(out.readUInt32BE(idx) + delta, idx)
        }
      } else if (b.type === "co64") {
        const n = out.readUInt32BE(d + 4)
        for (let i = 0; i < n; i++) {
          const idx = d + 8 + i * 8
          const hi = out.readUInt32BE(idx), lo = out.readUInt32BE(idx + 4)
          const updated = hi * 0x1_0000_0000 + lo + delta
          out.writeUInt32BE(Math.floor(updated / 0x1_0000_0000), idx)
          out.writeUInt32BE(updated >>> 0, idx + 4)
        }
      } else if (CONTAINERS.has(b.type)) walk(buf, d, pos + b.size)
      pos += b.size
    }
  }
  walk(out, 0, out.length)
  return out
}

function mp4Faststart(input) {
  if (input.length < 16) return input
  const boxes = parseTopLevel(input)
  const moov = boxes.find(b => b.type === "moov")
  const mdat = boxes.find(b => b.type === "mdat")
  if (!moov || !mdat || moov.offset < mdat.offset) return input
  const groupA = boxes.filter(b => b.type !== "moov" && b.type !== "mdat" && b.offset < mdat.offset)
  const groupD = boxes.filter(b => b.type === "mdat" || b.offset > moov.offset)
  const sizeA = groupA.reduce((s, b) => s + b.size, 0)
  // delta = how far mdat shifts right (moov is inserted before it)
  const delta = (sizeA + moov.size) - mdat.offset
  const updatedMoov = shiftChunkOffsets(input.subarray(moov.offset, moov.offset + moov.size), delta)
  return Buffer.concat([
    ...groupA.map(b => input.subarray(b.offset, b.offset + b.size)),
    updatedMoov,
    ...groupD.map(b => input.subarray(b.offset, b.offset + b.size)),
  ])
}

function isSlowStart(buf) {
  const boxes = parseTopLevel(buf)
  const moov = boxes.find(b => b.type === "moov")
  const mdat = boxes.find(b => b.type === "mdat")
  return moov && mdat && moov.offset > mdat.offset
}

// ─────────────────────────────────────────────────────────────────────────────

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function main() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  const cfg = {
    accessKeyId:     settings.r2AccessKeyId,
    secretAccessKey: settings.r2SecretAccessKey,
    bucketName:      settings.r2BucketName,
    region:          settings.r2Region ?? "auto",
    endpoint:        settings.r2Endpoint ?? `https://${settings.r2AccountId}.r2.cloudflarestorage.com`,
  }
  const client = new S3Client({
    region: cfg.region, endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })

  // All assets stored as octet-stream
  const assets = await prisma.asset.findMany({
    where: { contentType: "application/octet-stream" },
    orderBy: { createdAt: "desc" },
  })

  console.log(`Found ${assets.length} assets with wrong content-type\n`)

  let fixed = 0, skipped = 0, errors = 0

  for (const asset of assets) {
    const ext = path.extname(asset.objectKey).toLowerCase()
    const correctType = mime.lookup(asset.objectKey) || "application/octet-stream"

    if (correctType === "application/octet-stream") {
      console.log(`SKIP  ${asset.objectKey}  (unknown extension)`)
      skipped++
      continue
    }

    const isVideo = correctType.startsWith("video/")

    try {
      process.stdout.write(`FIX   ${asset.objectKey}  ${correctType}`)

      if (isVideo) {
        // Need to download, potentially faststart, and re-upload
        const resp = await client.send(new GetObjectCommand({ Bucket: cfg.bucketName, Key: asset.objectKey }))
        let buf = await streamToBuffer(resp.Body)

        const wasSlowStart = isSlowStart(buf)
        if (wasSlowStart) {
          buf = mp4Faststart(buf)
          process.stdout.write("  [faststart applied]")
        }

        await client.send(new PutObjectCommand({
          Bucket: cfg.bucketName,
          Key: asset.objectKey,
          Body: buf,
          ContentType: correctType,
          ContentLength: buf.length,
        }))

        // Update DB
        await prisma.asset.update({
          where: { id: asset.id },
          data: { contentType: correctType, sizeBytes: buf.length },
        })
      } else {
        // Images/audio: CopyObject in-place to update metadata only
        await client.send(new CopyObjectCommand({
          Bucket: cfg.bucketName,
          CopySource: `${cfg.bucketName}/${asset.objectKey}`,
          Key: asset.objectKey,
          ContentType: correctType,
          MetadataDirective: "REPLACE",
        }))
        await prisma.asset.update({
          where: { id: asset.id },
          data: { contentType: correctType },
        })
      }

      console.log("  ✅")
      fixed++
    } catch (e) {
      console.log(`  ❌ ${e.message}`)
      errors++
    }
  }

  console.log(`\nDone — ${fixed} fixed, ${skipped} skipped, ${errors} errors`)
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
