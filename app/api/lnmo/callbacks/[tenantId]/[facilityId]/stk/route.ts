import { NextResponse } from "next/server"
import { handleStkCallback } from "@/lib/mpesa"

export async function POST(request: Request) {
  const body = await request.json()
  const result = await handleStkCallback(body)
  return NextResponse.json(result)
}
