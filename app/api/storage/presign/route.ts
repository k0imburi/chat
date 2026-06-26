import { NextResponse } from "next/server"
import { z } from "zod"
import { getCustomerSession } from "@/lib/customer-auth"
import { logError } from "@/lib/log-error"
import { getPresignedUploadUrl } from "@/lib/r2"

const schema = z.object({
  filename: z.string().min(1).max(255),
  dir_name: z.string().default("uploads"),
  visibility: z.enum(["public", "private"]).default("public"),
})

export async function POST(request: Request) {
  const session = await getCustomerSession()
  if (!session?.userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  try {
    const body = schema.parse(await request.json())
    const root = body.visibility === "private" ? "private" : "uploads"
    const prefix = `${root}/${session.userId}/${body.dir_name}`
    const result = await getPresignedUploadUrl(body.filename, prefix, 900, body.visibility)

    return NextResponse.json({
      success: true,
      upload_url: result.uploadUrl,
      object_key: result.objectKey,
      public_url: result.publicUrl,
      content_type: result.contentType,
      expires_in: result.expiresIn,
      visibility: body.visibility,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    logError("/api/storage/presign", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate upload URL" },
      { status: 500 },
    )
  }
}
