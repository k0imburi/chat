import { HeadObjectCommand } from "@aws-sdk/client-s3"
import { NextResponse } from "next/server"
import { z } from "zod"
import { getCustomerSession } from "@/lib/customer-auth"
import { logError } from "@/lib/log-error"
import { prisma } from "@/lib/prisma"
import { getPublicUrl, getR2Client } from "@/lib/r2"

const schema = z.object({
  object_key: z.string().min(1),
  public_url: z.string().optional().nullable(),
  content_type: z.string().min(1),
  size_bytes: z.number().int().positive().optional(),
  dir_name: z.string().default("uploads"),
  visibility: z.enum(["public", "private"]).default("public"),
})

export async function POST(request: Request) {
  const session = await getCustomerSession()
  if (!session?.userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  try {
    const body = schema.parse(await request.json())
    const requiredPrefix = `${body.visibility === "private" ? "private" : "uploads"}/${session.userId}/`
    if (!body.object_key.startsWith(requiredPrefix)) {
      return NextResponse.json({ success: false, error: "Object does not belong to this account" }, { status: 403 })
    }

    const { client, settings } = await getR2Client()
    const bucket = body.visibility === "private" ? settings.privateBucketName : settings.bucketName
    let sizeBytes = body.size_bytes ?? 0

    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: body.object_key }))
      sizeBytes = head.ContentLength ?? sizeBytes
    } catch {
      return NextResponse.json({ success: false, error: "Object not found in R2. Upload may have failed." }, { status: 404 })
    }

    const resolvedPublicUrl = body.visibility === "private"
      ? ""
      : (body.public_url || null) ?? getPublicUrl(body.object_key, settings.publicBaseUrl) ?? ""
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
        metadata: { userId: session.userId, dirName: body.dir_name, source: "customer-web-presign" },
      },
      update: { sizeBytes, contentType: body.content_type, visibility: body.visibility, bucket },
    })

    return NextResponse.json({
      success: true,
      asset_id: asset.id,
      public_url: resolvedPublicUrl,
      object_key: body.object_key,
      visibility: body.visibility,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    logError("/api/storage/presign/confirm", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to confirm upload" },
      { status: 500 },
    )
  }
}
