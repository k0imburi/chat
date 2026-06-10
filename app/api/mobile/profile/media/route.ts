import { MediaKind } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { findMobileUserById, serializeMobileUser } from "@/lib/mobile-users"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"

const createSchema = z.object({
  kind: z.nativeEnum(MediaKind),
  videoUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  url: z.string().url().optional(),
  title: z.string().optional(),
  caption: z.string().max(2200).optional(),
  description: z.string().max(2200).optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.coerce.number().optional(),
})

const viewsSchema = z.object({
  mediaId: z.string(),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsed = createSchema.parse(await request.json())
    const url = parsed.videoUrl || parsed.url
    if (!url) {
      return NextResponse.json({ success: false, message: "A media URL is required" }, { status: 400 })
    }

    const existingProfile = parsed.kind === MediaKind.PROFILE_VIDEO
      ? await prisma.userMedia.findFirst({
          where: { userId: session.userId, kind: MediaKind.PROFILE_VIDEO },
        })
      : null

    if (existingProfile) {
      await prisma.userMedia.update({
        where: { id: existingProfile.id },
        data: {
          url,
          thumbnailUrl: parsed.thumbnailUrl || url,
          title: parsed.title,
          caption: parsed.caption,
          description: parsed.description,
          mimeType: parsed.mimeType,
          sizeBytes: parsed.sizeBytes,
        },
      })
    } else {
      await prisma.userMedia.create({
        data: {
          userId: session.userId,
          kind: parsed.kind,
          url,
          thumbnailUrl: parsed.thumbnailUrl || url,
          title: parsed.title,
          caption: parsed.caption,
          description: parsed.description,
          mimeType: parsed.mimeType,
          sizeBytes: parsed.sizeBytes,
        },
      })
    }

    const user = await findMobileUserById(session.userId)
    return NextResponse.json({ success: true, user: user ? serializeMobileUser(user) : null })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    logError("/api/mobile/profile/media", error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to save media" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = viewsSchema.parse(body)
    const viewOnly = body.viewOnly === true

    await prisma.userMedia.update({
      where: { id: parsed.mediaId },
      data: { views: { increment: 1 } },
    })

    if (viewOnly) {
      return NextResponse.json({ success: true })
    }

    const user = await findMobileUserById(session.userId)
    return NextResponse.json({ success: true, user: user ? serializeMobileUser(user) : null })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    logError("/api/mobile/profile/media", error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to update media" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const mediaId = url.searchParams.get("mediaId")

  if (!mediaId) {
    return NextResponse.json({ success: false, message: "mediaId is required" }, { status: 400 })
  }

  await prisma.userMedia.deleteMany({
    where: {
      id: mediaId,
      userId: session.userId,
    },
  })

  const user = await findMobileUserById(session.userId)
  return NextResponse.json({
    success: true,
    user: user ? serializeMobileUser(user) : null,
  })
}
