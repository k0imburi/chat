import { NextResponse } from "next/server"
import { SwipeDirection } from "@prisma/client"
import { z } from "zod"
import { getSwipedUsers, saveSwipe } from "@/lib/mobile-social"

const getSchema = z.object({
  userId: z.string().min(1),
})

const postSchema = z.object({
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  direction: z.nativeEnum(SwipeDirection).optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    userId: url.searchParams.get("userId") || "",
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 })
  }

  const data = await getSwipedUsers(parsed.data.userId)
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.parse(await request.json())
    const data = await saveSwipe(parsed)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to save swipe" },
      { status: 500 },
    )
  }
}
