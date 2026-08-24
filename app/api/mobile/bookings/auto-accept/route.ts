import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

// Reflects a live per-user preference, so it must never be cached.
export const dynamic = "force-dynamic"

const schema = z.object({ enabled: z.boolean() })

/** Current auto-accept setting for the signed-in creator. */
export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { autoAcceptBookings: true },
  })
  return NextResponse.json({
    success: true,
    data: { enabled: user?.autoAcceptBookings === true },
  })
}

/** Turns auto-accept on or off for the signed-in creator. */
export async function PATCH(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const { enabled } = schema.parse(await request.json())
    const user = await prisma.user.update({
      where: { id: session.userId },
      data: { autoAcceptBookings: enabled },
      select: { autoAcceptBookings: true },
    })
    console.info("[bookings:auto-accept]", { userId: session.userId, enabled })
    // Deliberately affects FUTURE proposals only. Retroactively approving
    // whatever is already sitting in PROPOSED would commit the creator to
    // slots they have not looked at, on the strength of a toggle they just
    // flipped — the opposite of the control this setting is meant to give.
    return NextResponse.json({
      success: true,
      data: { enabled: user.autoAcceptBookings },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Could not update the setting",
      },
      { status: 400 },
    )
  }
}
