import { NextResponse } from "next/server"
import { uploadBufferToR2 } from "@/lib/r2"
import { logError } from "@/lib/log-error"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const userId = String(formData.get("user_id") || "anonymous")
    const dirName = String(formData.get("dir_name") || "uploads")

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file supplied" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadBufferToR2(buffer, file.name, {
      contentType: file.type,
      prefix: `uploads/${userId}/${dirName}`,
      metadata: {
        userId,
        dirName,
        source: "mobile-client",
      },
    })

    return NextResponse.json({
      success: true,
      file_url: result.url,
      object_key: result.objectKey,
    })
  } catch (error) {
    logError("/api/storage/upload", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    )
  }
}
