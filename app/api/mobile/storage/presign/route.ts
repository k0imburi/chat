/**
 * POST /api/mobile/storage/presign
 *
 * Returns a short-lived presigned R2 PUT URL so the mobile client can
 * upload a file **directly** to R2 — the binary never touches this server.
 *
 * Mobile upload flow:
 *   1. POST /api/mobile/storage/presign   → { upload_url, object_key, public_url, content_type, expires_in }
 *   2. PUT  {upload_url}                  → raw binary, header: Content-Type: {content_type}
 *   3. POST /api/mobile/storage/presign/confirm  → logs asset to DB (optional but recommended)
 *
 * Body: { filename: string, dir_name?: string }
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getPresignedUploadUrl } from "@/lib/r2"
import { logError } from "@/lib/log-error"

const schema = z.object({
  filename: z.string().min(1).max(255),
  dir_name: z.string().default("uploads"),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = schema.parse(await request.json())

    const prefix = `uploads/${session.userId}/${body.dir_name}`
    const result = await getPresignedUploadUrl(body.filename, prefix)

    return NextResponse.json({
      success: true,
      upload_url:   result.uploadUrl,
      object_key:   result.objectKey,
      public_url:   result.publicUrl,
      content_type: result.contentType,
      expires_in:   result.expiresIn,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }
    logError("/api/mobile/storage/presign", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate upload URL" },
      { status: 500 },
    )
  }
}
