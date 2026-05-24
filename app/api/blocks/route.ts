import { NextResponse } from "next/server"
import { z } from "zod"
import { blockUser, getBlockedUsers, isBlocked, unblockUser } from "@/lib/mobile-social"
import { logError } from "@/lib/log-error"

const getSchema = z.object({
  action: z.enum(["list", "status"]),
  userId: z.string().optional(),
  userId1: z.string().optional(),
  userId2: z.string().optional(),
})

const postSchema = z.object({
  currentUserId: z.string().min(1),
  otherUserId: z.string().min(1),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    action: url.searchParams.get("action"),
    userId: url.searchParams.get("userId") || undefined,
    userId1: url.searchParams.get("userId1") || undefined,
    userId2: url.searchParams.get("userId2") || undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
  }

  if (parsed.data.action === "status") {
    if (!parsed.data.userId1 || !parsed.data.userId2) {
      return NextResponse.json({ success: false, message: "userId1 and userId2 are required" }, { status: 400 })
    }

    const data = await isBlocked(parsed.data.userId1, parsed.data.userId2)
    return NextResponse.json({ success: true, data })
  }

  if (!parsed.data.userId) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 })
  }

  const data = await getBlockedUsers(parsed.data.userId)
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.parse(await request.json())
    const data = await blockUser(parsed.currentUserId, parsed.otherUserId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/blocks", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to block user" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const parsed = postSchema.safeParse({
    currentUserId: url.searchParams.get("currentUserId") || "",
    otherUserId: url.searchParams.get("otherUserId") || "",
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "currentUserId and otherUserId are required" }, { status: 400 })
  }

  const data = await unblockUser(parsed.data.currentUserId, parsed.data.otherUserId)
  return NextResponse.json({ success: true, data })
}
