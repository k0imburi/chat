import { NextResponse } from "next/server"
import { z } from "zod"
import {
  createUserNotification,
  deleteAllNotifications,
  listUserNotifications,
} from "@/lib/mobile-notifications"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"

const getSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
})

const postSchema = z.object({
  receiverUserId: z.string().min(1),
  senderId: z.string().optional(),
  title: z.string().optional(),
  message: z.string().min(1),
  type: z.string().min(1).optional(),
  videoIndex: z.coerce.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    page: url.searchParams.get("page") || undefined,
    limit: url.searchParams.get("limit") || undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
  }

  const result = await listUserNotifications({
    userId: session.userId,
    page: parsed.data.page,
    limit: parsed.data.limit,
  })

  return NextResponse.json({ success: true, ...result })
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsed = postSchema.parse(await request.json())
    const notification = await createUserNotification({
      userId: parsed.receiverUserId,
      senderId: parsed.senderId || session.userId,
      title: parsed.title,
      message: parsed.message,
      type: parsed.type,
      metadata: {
        ...(parsed.metadata || {}),
        videoIndex: parsed.videoIndex ?? parsed.metadata?.videoIndex ?? 0,
      },
    })

    return NextResponse.json({ success: true, data: notification })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to save notification" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const result = await deleteAllNotifications(session.userId)
  return NextResponse.json(result)
}
