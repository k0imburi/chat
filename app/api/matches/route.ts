import { NextResponse } from "next/server"
import { z } from "zod"
import { deleteMatch, getMatches, markMatchViewed } from "@/lib/mobile-social"

const getSchema = z.object({
  userId: z.string().min(1),
})

const patchSchema = z.object({
  userId: z.string().min(1),
  matchedUserId: z.string().min(1),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    userId: url.searchParams.get("userId") || "",
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 })
  }

  const data = await getMatches(parsed.data.userId)
  return NextResponse.json({ success: true, data })
}

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.parse(await request.json())
    const data = await markMatchViewed(parsed.userId, parsed.matchedUserId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update match" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const parsed = patchSchema.safeParse({
    userId: url.searchParams.get("userId") || "",
    matchedUserId: url.searchParams.get("matchedUserId") || "",
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "userId and matchedUserId are required" }, { status: 400 })
  }

  const data = await deleteMatch(parsed.data.userId, parsed.data.matchedUserId)
  return NextResponse.json({ success: true, data })
}
