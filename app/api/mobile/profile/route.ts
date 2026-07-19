import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { findMobileUserById, serializeMobileUserWithCounts, updateMobileUserProfile } from "@/lib/mobile-users"
import { InvalidUsernameError, UsernameTakenError } from "@/lib/username-rules"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"
import { emitChatRealtimeToUser } from "@/lib/realtime"

const schema = z.object({
  fullName: z.string().min(2).optional(),
  fullname: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  gender: z.string().optional(),
  birthday: z.string().optional(),
  username: z.string().optional(),
  bio: z.string().optional(),
  deviceToken: z.string().optional(),
  deviceSystem: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  interests: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
  swipeCount: z.coerce.number().int().optional(),
  lastSwipeDate: z.string().optional(),
  status: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  profileVideo: z
    .object({
      videoUrl: z.string().url().optional(),
      imageUrl: z.string().url().optional(),
      thumbnailUrl: z.string().url(),
    })
    .refine((data) => data.videoUrl || data.imageUrl, "Either videoUrl or imageUrl is required")
    .optional(),
})

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const user = await findMobileUserById(session.userId)
  if (!user) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    user: await serializeMobileUserWithCounts(user),
  })
}

export async function PATCH(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsed = schema.parse(await request.json())
    const user = await updateMobileUserProfile(session.userId, {
      ...parsed,
      fullName: parsed.fullName ?? parsed.fullname,
    })
    const serialized = await serializeMobileUserWithCounts(user)

    emitChatRealtimeToUser(session.userId, {
      channel: "profile",
      type: "profile_updated",
      data: serialized,
    })

    return NextResponse.json({
      success: true,
      user: serialized,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    if (error instanceof InvalidUsernameError || error instanceof UsernameTakenError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 })
    }

    logError("/api/mobile/profile", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update profile" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  await prisma.user.delete({
    where: { id: session.userId },
  })

  return NextResponse.json({
    success: true,
    message: "Profile account deleted",
  })
}
