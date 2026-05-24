import { NextResponse } from "next/server"
import mime from "mime-types"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getR2Client, generateR2Key, getPublicUrl } from "@/lib/r2"
import { mp4Faststart, isMP4Buffer } from "@/lib/mp4-faststart"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"
import { PutObjectCommand } from "@aws-sdk/client-s3"

/** 200 MB — hard cap for mobile uploads */
const MAX_BYTES = 200 * 1024 * 1024

/**
 * Resolve the correct MIME type for a file.
 *
 * Mobile clients (Android/iOS) frequently send `application/octet-stream`
 * as the multipart Content-Type instead of the actual MIME type.
 * We always prefer the extension-based lookup and only fall back to the
 * client-supplied value when we have nothing better.
 */
function resolveContentType(fileName: string, clientType: string): string {
  const fromExt = mime.lookup(fileName)
  if (fromExt && fromExt !== "application/octet-stream") return fromExt
  if (clientType && clientType !== "application/octet-stream") return clientType
  return "application/octet-stream"
}

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const dirName = String(formData.get("dir_name") || "uploads")

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file supplied" }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `File exceeds the ${MAX_BYTES / 1024 / 1024} MB limit` },
        { status: 413 },
      )
    }

    // ── Buffer the upload ─────────────────────────────────────────────────
    // Use Uint8Array view to avoid the Buffer<ArrayBuffer> vs Buffer<ArrayBufferLike>
    // generic mismatch that TypeScript raises with File.arrayBuffer()
    let buffer: Buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()))

    // ── Correct content type (ignore client's application/octet-stream) ──
    const contentType = resolveContentType(file.name, file.type)

    // ── MP4 faststart: move moov before mdat for instant playback ─────────
    // Without this, videos have moov at the end and players show only a few
    // frames (looks like a GIF) until the full file downloads.
    if (contentType === "video/mp4" || contentType === "video/quicktime") {
      if (isMP4Buffer(buffer)) {
        const out = mp4Faststart(buffer)
        if (out !== buffer) {
          console.log(
            `[upload] MP4 faststart applied to ${file.name}: ` +
              `${buffer.length} B → ${out.length} B`,
          )
        }
        buffer = out
      }
    }

    // ── Upload to R2 ──────────────────────────────────────────────────────
    const { client, settings } = await getR2Client()
    const objectKey = generateR2Key(file.name, `uploads/${session.userId}/${dirName}`)

    await client.send(
      new PutObjectCommand({
        Bucket: settings.bucketName,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
        Metadata: {
          userId: session.userId,
          dirName,
          source: "mobile-client",
          originalName: file.name,
        },
      }),
    )

    const url = getPublicUrl(objectKey, settings.publicBaseUrl)

    await prisma.asset.create({
      data: {
        name: file.name,
        objectKey,
        url,
        contentType,
        sizeBytes: buffer.length,
        bucket: settings.bucketName,
        metadata: { userId: session.userId, dirName, source: "mobile-client" },
      },
    })

    return NextResponse.json({ success: true, file_url: url, object_key: objectKey })
  } catch (error) {
    logError("/api/mobile/storage/upload", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    )
  }
}
