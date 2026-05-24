import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deleteFromR2 } from "@/lib/r2"
import { logError } from "@/lib/log-error"

function extractObjectKey(fileUrl: string) {
  try {
    const url = new URL(fileUrl)
    return url.pathname.replace(/^\/+/, "")
  } catch {
    return ""
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { file_url?: string }
    const fileUrl = body.file_url?.trim()

    if (!fileUrl) {
      return NextResponse.json({ success: false, error: "file_url is required" }, { status: 400 })
    }

    const asset = await prisma.asset.findFirst({
      where: {
        OR: [{ url: fileUrl }, { objectKey: extractObjectKey(fileUrl) }],
      },
    })

    const objectKey = asset?.objectKey || extractObjectKey(fileUrl)

    if (!objectKey) {
      return NextResponse.json({ success: false, error: "Unable to resolve file key" }, { status: 404 })
    }

    await deleteFromR2(objectKey)

    return NextResponse.json({ success: true })
  } catch (error) {
    logError("/api/storage/delete", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 },
    )
  }
}
