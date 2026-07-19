import { NextResponse } from "next/server"
import { isUsernameAvailable, isValidUsernameFormat } from "@/lib/username-rules"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const username = url.searchParams.get("username")?.trim()

  if (!username || !isValidUsernameFormat(username)) {
    return NextResponse.json({ available: false, message: "Invalid username format" }, { status: 400 })
  }

  return NextResponse.json({ available: await isUsernameAvailable(username) })
}
