import { NextResponse } from "next/server"
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { generateR2Key, getR2Client } from "@/lib/r2"
import { prisma } from "@/lib/prisma"
import { reserveVaultUpload, commitVaultUpload, releaseVaultReservation } from "@/lib/vault-accounting"
import { saveVaultUpload, listSecureFolderMessages } from "@/lib/mobile-chat-privacy"
import { logError } from "@/lib/log-error"

export async function POST(request: Request) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })
  let objectKey = "", bucket = "", reserved = false, committed = false, saved = false
  try {
    const form = await request.formData()
    const file = form.get("file"), code = String(form.get("code") || "")
    const folderId = String(form.get("folderId") || "") || undefined
    if (!(file instanceof File) || !file.size) return NextResponse.json({ success: false, message: "Choose a file" }, { status: 400 })
    if (!/^\d{4}$/.test(code)) return NextResponse.json({ success: false, message: "Enter a valid four-digit Vault code" }, { status: 400 })

    const storage = await getR2Client()
    bucket = storage.settings.privateBucketName
    objectKey = generateR2Key(file.name, `private/${viewer.userId}/vault`)
    // Vault storage allowance is the only per-file size limit.
    await reserveVaultUpload(viewer.userId, objectKey, file.size)
    reserved = true
    const buffer = Buffer.from(await file.arrayBuffer())
    await storage.client.send(new PutObjectCommand({
      Bucket: bucket, Key: objectKey, Body: buffer,
      ContentType: file.type || "application/octet-stream",
      ContentLength: buffer.length,
      Metadata: { userId: viewer.userId, source: "customer-web-vault" },
    }))
    await commitVaultUpload(viewer.userId, objectKey, buffer.length)
    committed = true
    await prisma.asset.create({
      data: {
        name: file.name, objectKey, contentType: file.type || "application/octet-stream",
        sizeBytes: buffer.length, bucket, visibility: "private",
        metadata: { userId: viewer.userId, source: "customer-web-vault" },
      },
    })
    await saveVaultUpload(viewer.userId, { code, objectKey, name: file.name, folderId })
    saved = true
    return NextResponse.json({ success: true, data: await listSecureFolderMessages(viewer.userId, code) })
  } catch (error) {
    if (objectKey && !saved) {
      try {
        const storage = await getR2Client()
        if (bucket) await storage.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
        await prisma.asset.deleteMany({ where: { objectKey } })
        if (committed) await prisma.vaultUploadLedger.deleteMany({ where: { userId: viewer.userId, objectKey } })
        else if (reserved) await releaseVaultReservation(viewer.userId, objectKey)
      } catch (cleanupError) {
        logError("/api/customer/vault/upload cleanup", cleanupError)
      }
    }
    logError("/api/customer/vault/upload", error)
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Upload failed" }, { status })
  }
}
