import { NextResponse } from "next/server"
import { UserRole } from "@prisma/client"
import { requireSessionUser } from "@/lib/auth"
import { logError } from "@/lib/log-error"
import { getSignedPrivateR2DownloadUrl } from "@/lib/r2"

function isAdminRole(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN
}

export async function GET(request: Request) {
  const session = await requireSessionUser()
  if (!session || !isAdminRole(session.role)) {
    return NextResponse.json({ success: false, message: "Administrator access required" }, { status: 403 })
  }

  const key = new URL(request.url).searchParams.get("key") || ""
  if (!key.startsWith("private/")) {
    return NextResponse.json({ success: false, message: "Invalid private file key" }, { status: 400 })
  }

  try {
    const url = await getSignedPrivateR2DownloadUrl(key, 120)
    return NextResponse.redirect(url, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    })
  } catch (error) {
    logError("/api/admin/private-file", error)
    return NextResponse.json({ success: false, message: "Unable to open private file" }, { status: 500 })
  }
}
