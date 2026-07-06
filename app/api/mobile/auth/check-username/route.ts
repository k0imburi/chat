import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const username = url.searchParams.get("username")?.trim()

  if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json({ available: false, message: "Invalid username format" }, { status: 400 })
  }

  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: { id: true },
  })

  return NextResponse.json({ available: !existing })
}
