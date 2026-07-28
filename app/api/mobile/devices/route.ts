import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(["android", "ios"]),
  fcmToken: z.string().min(1).optional(),
  voipToken: z.string().min(1).optional(),
})

export async function PUT(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const input = schema.parse(await request.json())
    const installation = await prisma.deviceInstallation.upsert({
      where: { userId_deviceId: { userId: session.userId, deviceId: input.deviceId } },
      create: { userId: session.userId, ...input },
      update: { ...input, isActive: true },
    })
    return NextResponse.json({ success: true, data: installation })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Invalid device" }, { status: 400 })
  }
}
