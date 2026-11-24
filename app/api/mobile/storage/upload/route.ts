import { NextResponse } from "next/server"
import mime from "mime-types"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getR2Client, generateR2Key, getPublicUrl } from "@/lib/r2"
import { mp4Faststart, isMP4Buffer } from "@/lib/mp4-faststart"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { reserveVaultUpload, commitVaultUpload, releaseVaultReservation } from '@/lib/vault-accounting'
import { assertStorageAvailable } from "@/lib/storage-quota"
import { chatPhotoPrefix, encryptChatPhoto } from "@/lib/chat-photo-storage"
import { env } from "@/lib/env"
import { vaultMediaEncryptionHeaders, vaultWebMediaPrefix } from "@/lib/vault-media-storage"

/** 100 MB cap for non-Vault media; Vault files use the account quota. */
const MAX_BYTES = 100 * 1024 * 1024

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
    const privateUpload = formData.get("visibility") === "private"
    const vaultMedia = privateUpload && dirName === "vault"
    const privatePhoto = privateUpload && dirName === "chats"

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file supplied" }, { status: 400 })
    }

    const contentType = resolveContentType(file.name, file.type)
    const isPhoto = /^image\/(jpeg|png|gif|webp|heic|heif|bmp|tiff|avif)$/.test(contentType)
    const isVideo = /^video\/(mp4|quicktime|webm|x-m4v|ogg)$/.test(contentType)
    if (privateUpload && (!file.size || !(privatePhoto && isPhoto || vaultMedia))) {
      return NextResponse.json({ success: false, error: "Choose a supported photo or video." }, { status: 400 })
    }
    // Vault file size is limited by the user's remaining Vault allowance.
    // Other private uploads retain their smaller platform file cap.
    const maxBytes = vaultMedia ? Number.MAX_SAFE_INTEGER : privateUpload && !isVideo ? 25 * 1024 * 1024 : MAX_BYTES
    if (file.size > maxBytes) {
      return NextResponse.json(
        { success: false, error: `File exceeds the ${maxBytes / 1024 / 1024} MB limit` },
        { status: 413 },
      )
    }
    if (!vaultMedia) await assertStorageAvailable(session.userId, file.size)

    // ── Buffer the upload ─────────────────────────────────────────────────
    // Use Uint8Array view to avoid the Buffer<ArrayBuffer> vs Buffer<ArrayBufferLike>
    // generic mismatch that TypeScript raises with File.arrayBuffer()
    let buffer: Buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()))

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
    const bucket = settings.bucketName
    const objectKey = vaultMedia
      ? generateR2Key("media", vaultWebMediaPrefix)
      : privatePhoto
      ? generateR2Key("photo", chatPhotoPrefix)
      : generateR2Key(file.name, `uploads/${session.userId}/${dirName}`)
    const payload = privatePhoto
      ? encryptChatPhoto(buffer, objectKey, contentType, env.JWT_SECRET)
      : buffer

    if (vaultMedia) await reserveVaultUpload(session.userId, objectKey, buffer.length)
    try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: payload,
        ContentType: privatePhoto ? "application/octet-stream" : contentType,
        ContentLength: payload.length,
        ...(vaultMedia ? vaultMediaEncryptionHeaders(objectKey, env.JWT_SECRET) : {}),
        Metadata: privatePhoto ? { "photo-content-type": contentType } : vaultMedia ? undefined : {
          userId: session.userId,
          dirName,
          source: "mobile-client",
          originalName: file.name,
        },
      }),
    )

    if (vaultMedia) await commitVaultUpload(session.userId, objectKey, buffer.length)
    } catch (error) {
      if (vaultMedia) await releaseVaultReservation(session.userId, objectKey)
      throw error
    }

    const url = privateUpload ? null : getPublicUrl(objectKey, settings.publicBaseUrl)

    await prisma.asset.create({
      data: {
        name: file.name,
        objectKey,
        url,
        contentType,
        sizeBytes: buffer.length,
        bucket,
        visibility: privateUpload ? "private" : "public",
        metadata: { userId: session.userId, dirName, source: "mobile-client" },
      },
    })

    return NextResponse.json({ success: true, file_url: url, object_key: objectKey, ...(vaultMedia ? { content_type: contentType } : {}) })
  } catch (error) {
    logError("/api/mobile/storage/upload", error)
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status },
    )
  }
}
