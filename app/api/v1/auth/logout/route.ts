import { NextResponse } from "next/server"
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-auth"

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete(CUSTOMER_SESSION_COOKIE)
  return response
}
