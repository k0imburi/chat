import { NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { generateR2Key, getR2Client } from "@/lib/r2"
import { prisma } from "@/lib/prisma"
import { assertStorageAvailable } from "@/lib/storage-quota"
import { sendMessage } from "@/lib/mobile-chats"
import { listSecureFolderMessages, moveMessagesToSecureFolder } from "@/lib/mobile-chat-privacy"
import { logError } from "@/lib/log-error"

const MAX_BYTES = 100 * 1024 * 1024

export async function POST(request: Request) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })
  try {
    const form = await request.formData(), file = form.get("file"), code = String(form.get("code") || "")
    if (!(file instanceof File) || !file.size) return NextResponse.json({ success: false, message: "Choose a file" }, { status: 400 })
    if (!/^\d{4}$/.test(code)) return NextResponse.json({ success: false, message: "Enter a valid four-digit Vault code" }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ success: false, message: "Files can be up to 100MB" }, { status: 400 })
    await assertStorageAvailable(viewer.userId, file.size)
    const { client, settings } = await getR2Client(), objectKey = generateR2Key(file.name, `private/${viewer.userId}/vault`), buffer = Buffer.from(await file.arrayBuffer())
    await client.send(new PutObjectCommand({ Bucket: settings.privateBucketName, Key: objectKey, Body: buffer, ContentType: file.type || "application/octet-stream", ContentLength: buffer.length, Metadata: { userId: viewer.userId, source: "customer-web-vault" } }))
    await prisma.asset.create({ data: { name: file.name, objectKey, contentType: file.type || "application/octet-stream", sizeBytes: buffer.length, bucket: settings.privateBucketName, visibility: "private", metadata: { userId: viewer.userId, source: "customer-web-vault" } } })
    const message = await sendMessage({ senderId: viewer.userId, receiverId: viewer.userId, textMsg: "__CHATANDTIP_VAULT_DIRECT_UPLOAD__", imageObjectKey: file.type.startsWith("image/") ? objectKey : undefined, videoObjectKey: file.type.startsWith("video/") ? objectKey : undefined, documentObjectKey: !file.type.startsWith("image/") && !file.type.startsWith("video/") ? objectKey : undefined, documentName: file.name, documentMimeType: file.type, documentSizeBytes: file.size })
    await moveMessagesToSecureFolder({ userId: viewer.userId, otherUserId: viewer.userId, messageIds: [message.id], code, confirmCode: code })
    return NextResponse.json({ success: true, data: await listSecureFolderMessages(viewer.userId, code) })
  } catch (error) {
    logError("/api/customer/vault/upload", error)
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Upload failed" }, { status })
  }
}
