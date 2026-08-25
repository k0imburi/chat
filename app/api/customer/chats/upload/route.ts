import { NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { generateR2Key, getR2Client } from "@/lib/r2"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"

const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024

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
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ success: false, message: "Only image attachments are supported here" }, { status: 400 })
    }
    if (image.size > MAX_CHAT_ATTACHMENT_BYTES) {
      return NextResponse.json({ success: false, message: "Image exceeds the 25MB chat limit" }, { status: 400 })
    }

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

    return NextResponse.json({ success: true, imageObjectKey: objectKey })
  } catch (error) {
    logError("/api/customer/chats/upload", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    )
  }
}
