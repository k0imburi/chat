import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { uploadBufferToR2 } from "@/lib/r2"

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  const prefix = String(formData.get("prefix") || "uploads")

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "No file supplied" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await uploadBufferToR2(buffer, file.name, {
    contentType: file.type,
    prefix,
    metadata: {
      uploadedBy: session.id,
    },
  })

  return NextResponse.json({
    success: true,
    data: {
      id: result.asset.id,
      objectKey: result.objectKey,
      url: result.url,
      contentType: result.asset.contentType,
      sizeBytes: result.asset.sizeBytes,
    },
  })
}
