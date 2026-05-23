import { NextResponse } from "next/server"
import { getMobileAppInfo } from "@/lib/mobile-app"

export async function GET() {
  const data = await getMobileAppInfo()
  return NextResponse.json(data)
}
