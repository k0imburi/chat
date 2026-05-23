import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({ success: true, data: session })
}
