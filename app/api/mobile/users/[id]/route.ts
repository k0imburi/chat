import { NextResponse } from "next/server"
import { findMobileUserById, serializeMobileUserWithCounts } from "@/lib/mobile-users"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const user = await findMobileUserById(id)

  if (!user) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    user: await serializeMobileUserWithCounts(user),
  })
}
