import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ ok: true, canary: "V9_ISOLATION_TEST" })
}
