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
    const installation = await prisma.$transaction(async (tx) => {
      // A phone's FCM token belongs to the account currently signed in. When
      // users switch accounts, retire the previous account's installation so
      // notifications cannot leak across profiles on the same device.
      if (input.fcmToken) {
        const previous = await tx.deviceInstallation.findMany({
          where: { fcmToken: input.fcmToken, userId: { not: session.userId } },
          select: { userId: true },
        })
        await tx.deviceInstallation.updateMany({
          where: { fcmToken: input.fcmToken, userId: { not: session.userId } },
          data: { isActive: false, fcmToken: null, voipToken: null },
        })
        const previousUserIds = [...new Set(previous.map((row) => row.userId))]
        if (previousUserIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: previousUserIds }, deviceToken: input.fcmToken },
            data: { deviceToken: null },
          })
        }
      }
      return tx.deviceInstallation.upsert({
        where: { userId_deviceId: { userId: session.userId, deviceId: input.deviceId } },
        create: { userId: session.userId, ...input },
        update: { ...input, isActive: true },
      })
    })
    return NextResponse.json({ success: true, data: installation })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Invalid device" }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const deviceId = new URL(request.url).searchParams.get("deviceId")
  if (!deviceId) return NextResponse.json({ success: false, message: "deviceId is required" }, { status: 400 })
  await prisma.deviceInstallation.updateMany({
    where: { userId: session.userId, deviceId },
    data: { isActive: false, fcmToken: null, voipToken: null },
  })
  return NextResponse.json({ success: true })
}
