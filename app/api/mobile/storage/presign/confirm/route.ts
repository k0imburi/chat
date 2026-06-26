/**
 * POST /api/mobile/storage/presign/confirm
 *
 * Call this after the direct R2 PUT completes to:
 *   1. Log the asset to the DB (for admin management, dedup, etc.)
 *   2. Trigger async MP4 faststart repair if the video has moov at the end.
 *
 * Body: {
 *   object_key:   string   (returned by /presign)
 *   public_url:   string   (returned by /presign)
 *   content_type: string   (returned by /presign)
 *   size_bytes?:  number   (optional — client can supply actual upload size)
 *   dir_name?:    string
 * }
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getR2Client, getPublicUrl } from "@/lib/r2"
import { mp4Faststart, isMP4Buffer } from "@/lib/mp4-faststart"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"
import { HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"

const schema = z.object({
  object_key:   z.string().min(1),
  public_url:   z.string().optional().nullable(),
  content_type: z.string().min(1),
  size_bytes:   z.number().int().positive().optional(),
  dir_name:     z.string().default("uploads"),
  visibility:   z.enum(["public", "private"]).default("public"),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = schema.parse(await request.json())

    // ── Verify the object actually exists in R2 ─────────────────────────
    const { client, settings } = await getR2Client()

    const bucket = body.visibility === "private" ? settings.privateBucketName : settings.bucketName
    let sizeBytes = body.size_bytes ?? 0
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: body.object_key }),
      )
      sizeBytes = head.ContentLength ?? sizeBytes
    } catch {
      return NextResponse.json(
        { success: false, error: "Object not found in R2. Upload may have failed." },
        { status: 404 },
      )
    }

    // ── Resolve public URL (client may send null if publicBaseUrl wasn't configured) ──
    const resolvedPublicUrl = body.visibility === "private"
      ? ""
      : (body.public_url || null) ?? getPublicUrl(body.object_key, settings.publicBaseUrl) ?? ""

    // ── Log asset to DB (upsert in case of retry) ───────────────────────
    const originalName = body.object_key.split("/").pop() ?? body.object_key
    const asset = await prisma.asset.upsert({
      where: { objectKey: body.object_key },
      create: {
        name: originalName,
        objectKey: body.object_key,
        url: resolvedPublicUrl || null,
        contentType: body.content_type,
        sizeBytes,
        bucket,
        visibility: body.visibility,
        metadata: { userId: session.userId, dirName: body.dir_name, source: "mobile-client-presign" },
      },
      update: { sizeBytes, contentType: body.content_type, visibility: body.visibility, bucket },
    })

    // ── Async MP4 faststart repair (fire-and-forget) ────────────────────
    // Most modern iOS/Android recordings are already faststart, so this
    // is a no-op for the majority of uploads.  We don't await it so the
    // client gets a fast response immediately.
    if (body.content_type === "video/mp4" || body.content_type === "video/quicktime") {
      runFaststartIfNeeded(client, settings, body.object_key, body.content_type, asset.id).catch(
        (err) => logError(`faststart background job [${body.object_key}]`, err),
      )
    }

    return NextResponse.json({
      success: true,
      asset_id:   asset.id,
      public_url: resolvedPublicUrl,
      object_key: body.object_key,
      visibility: body.visibility,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }
    logError("/api/mobile/storage/presign/confirm", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to confirm upload" },
      { status: 500 },
    )
  }
}

async function runFaststartIfNeeded(
  client: InstanceType<typeof import("@aws-sdk/client-s3").S3Client>,
  settings: { bucketName: string },
  objectKey: string,
  contentType: string,
  assetId: string,
) {
  // Download the video
  const resp = await client.send(
    new GetObjectCommand({ Bucket: settings.bucketName, Key: objectKey }),
  )
  const chunks: Buffer[] = []
  // @ts-expect-error — AWS SDK Body is an async iterable at runtime
  for await (const chunk of resp.Body) chunks.push(Buffer.from(chunk))
  const original = Buffer.concat(chunks)

  if (!isMP4Buffer(original)) return

  const fixed = mp4Faststart(original)
  if (fixed === original) {
    console.log(`[faststart] ${objectKey} — already faststart, skipped`)
    return
  }

  // Re-upload with corrected layout
  await client.send(
    new PutObjectCommand({
      Bucket: settings.bucketName,
      Key: objectKey,
      Body: fixed,
      ContentType: contentType,
      ContentLength: fixed.length,
    }),
  )

  // Update size in DB
  await prisma.asset.update({
    where: { id: assetId },
    data: { sizeBytes: fixed.length },
  })

  console.log(
    `[faststart] ${objectKey} — rewritten (${original.length} → ${fixed.length} bytes)`,
  )
}
