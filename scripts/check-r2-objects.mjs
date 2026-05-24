/**
 * Inspect the last 3 uploaded video objects in R2 and download the smallest
 * to check if it's a valid MP4 or a truncated file.
 */
import { PrismaClient } from "@prisma/client"
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import fs from "node:fs"
import path from "node:path"

const prisma = new PrismaClient()

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
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })

  // Pull last 5 video assets from DB
  const assets = await prisma.asset.findMany({
    where: { objectKey: { contains: "/videos/" } },
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  if (!assets.length) {
    console.log("No video assets found in DB")
    await prisma.$disconnect()
    return
  }

  console.log("=== Video objects in R2 ===")
  for (const a of assets) {
    try {
      const head = await client.send(new HeadObjectCommand({
        Bucket: cfg.bucketName,
        Key: a.objectKey,
      }))
      console.log(`\nKey         : ${a.objectKey}`)
      console.log(`DB sizeBytes: ${a.sizeBytes} bytes  (${(a.sizeBytes/1024).toFixed(1)} KB)`)
      console.log(`R2 size     : ${head.ContentLength} bytes  (${(head.ContentLength/1024).toFixed(1)} KB)`)
      console.log(`R2 Content-Type: ${head.ContentType}`)
      console.log(`Match? ${a.sizeBytes === head.ContentLength ? "✅ yes" : "❌ MISMATCH"}`)
    } catch (e) {
      console.log(`\nKey: ${a.objectKey}  → ❌ ${e.message}`)
    }
  }

  // Download the smallest video and inspect its header bytes
  const smallest = assets.sort((a, b) => a.sizeBytes - b.sizeBytes)[0]
  console.log(`\n=== Downloading smallest video for inspection ===`)
  console.log(`Key: ${smallest.objectKey}`)
  const resp = await client.send(new GetObjectCommand({
    Bucket: cfg.bucketName,
    Key: smallest.objectKey,
  }))

  const chunks = []
  for await (const chunk of resp.Body) chunks.push(chunk)
  const buf = Buffer.concat(chunks)

  const tmpPath = `/tmp/r2-video-check${path.extname(smallest.objectKey)}`
  fs.writeFileSync(tmpPath, buf)
  console.log(`Saved to: ${tmpPath}  (${buf.length} bytes)`)

  // Check the first 12 bytes for MP4 ftyp box signature
  const hex12 = buf.slice(0, 12).toString("hex")
  const ascii4 = buf.slice(4, 8).toString("ascii")
  console.log(`\nFirst 12 bytes (hex): ${hex12}`)
  console.log(`Bytes 4-8 (ascii)   : "${ascii4}"`)
  if (["ftyp", "moov", "mdat", "free", "skip"].includes(ascii4)) {
    console.log(`✅ Valid ISO Base Media (MP4/MOV) container — header recognised`)
  } else {
    console.log(`❌ Unrecognised header — file may be truncated or wrong format`)
  }
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
