import { NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { generateR2Key, getR2Client } from "@/lib/r2"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"
import { assertStorageAvailable } from "@/lib/storage-quota"

const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024

/**
 * Chat image attachment upload, split out of the old server-action form so
 * the chat UI can be a normal fetch-driven client component (needed for
 * realtime + optimistic send) instead of a full-page form submit.
 *
 * Same private-bucket + Asset-row pattern the previous inline server action
 * used — nothing about the storage behaviour changes, only how the request
 * reaches it.
 */
export async function POST(request: Request) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })

  try {
    const form = await request.formData()
    const image = form.get("image")
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ success: false, message: "No image provided" }, { status: 400 })
    }
    const supported = image.type.startsWith("image/") || image.type.startsWith("video/") || image.type.startsWith("audio/") || image.type === "application/pdf"
    if (!supported) {
      return NextResponse.json({ success: false, message: "This file type is not supported here" }, { status: 400 })
    }
    if (image.size > MAX_CHAT_ATTACHMENT_BYTES) {
      return NextResponse.json({ success: false, message: "File exceeds the 100MB chat limit" }, { status: 400 })
    }
    await assertStorageAvailable(viewer.userId, image.size)

    const { client, settings } = await getR2Client()
    const objectKey = generateR2Key(image.name, `private/${viewer.userId}/chat`)
    const buffer = Buffer.from(new Uint8Array(await image.arrayBuffer()))
    await client.send(new PutObjectCommand({
      Bucket: settings.privateBucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: image.type || "application/octet-stream",
      ContentLength: buffer.length,
      Metadata: { userId: viewer.userId, source: "customer-web-chat" },
    }))
    await prisma.asset.create({
      data: {
        name: image.name,
        objectKey,
        url: null,
        contentType: image.type || "application/octet-stream",
        sizeBytes: buffer.length,
        bucket: settings.privateBucketName,
        visibility: "private",
        metadata: { userId: viewer.userId, source: "customer-web-chat" },
      },
    })

    return NextResponse.json({ success: true, imageObjectKey: image.type.startsWith("image/") ? objectKey : undefined, videoObjectKey: image.type.startsWith("video/") ? objectKey : undefined, documentObjectKey: !image.type.startsWith("image/") && !image.type.startsWith("video/") ? objectKey : undefined, documentMimeType: image.type, documentName: image.name, documentSizeBytes: image.size, mediaType: image.type })
  } catch (error) {
    logError("/api/customer/chats/upload", error)
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Upload failed" },
      { status },
    )
  }
}
