import { NextResponse } from "next/server"
import { getCustomerSession } from "@/lib/customer-auth"
import { findMobileUserById, serializeMobileUserWithCounts } from "@/lib/mobile-users"

export async function GET() {
  const session = await getCustomerSession()
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const user = await findMobileUserById(session.userId)
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ success: true, data: { user: await serializeMobileUserWithCounts(user) } })
}
