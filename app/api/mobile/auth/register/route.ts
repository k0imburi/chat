import { NextResponse } from "next/server"
import { LoginProvider } from "@prisma/client"
import { z } from "zod"
import { signMobileSessionToken } from "@/lib/mobile-session"
import { mapMobileLoginProvider, registerMobileUser, serializeMobileUser } from "@/lib/mobile-users"
import { InvalidUsernameError, UsernameTakenError } from "@/lib/username-rules"
import { logError } from "@/lib/log-error"
import { broadcastCampaignNotifications } from "@/lib/mobile-notifications"
import { prisma } from "@/lib/prisma"

const WELCOME_MESSAGE = "Welcome to ChatAndTip 🎉 you are now a part of a community where people connect in a whole new way. Every conversation here is a chance to make someone's day a little brighter. Let's create something great together. The ChatAndTip Team"

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  phoneNumber: z.string().optional(),
  gender: z.string().optional(),
  language: z.string().max(200).optional(),
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
  loginProvider: z.nativeEnum(LoginProvider).optional(),
  profileVideo: z
    .object({
      videoUrl: z.string().url(),
      thumbnailUrl: z.string().url(),
    })
    .optional(),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const user = await registerMobileUser(parsed)
    const token = await signMobileSessionToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      loginProvider: mapMobileLoginProvider(user.loginProvider),
    })

    const campaignId = `welcome:${user.id}`
    const welcomeExists = await prisma.userNotification.findFirst({
      where: { userId: user.id, type: "broadcast", metadata: { path: "$.campaignId", equals: campaignId } },
      select: { id: true },
    })
    if (!welcomeExists) {
      await broadcastCampaignNotifications({
        title: "Welcome to ChatAndTip",
        message: WELCOME_MESSAGE,
        campaignId,
        targetFilter: { userIds: [user.id] },
        batchSize: 1,
      })
    }

    return NextResponse.json({
      success: true,
      token,
      user: serializeMobileUser(user),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    if (error instanceof InvalidUsernameError || error instanceof UsernameTakenError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 })
    }

    logError("/api/mobile/auth/register", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to register account" },
      { status: 500 },
    )
  }
}
