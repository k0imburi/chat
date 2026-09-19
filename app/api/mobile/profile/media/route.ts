import { MediaKind, Prisma, TagApprovalStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { findMobileUserById, serializeMobileUser } from "@/lib/mobile-users";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log-error";
import { createUserNotification } from "@/lib/mobile-notifications";

const createSchema = z.object({
  kind: z.nativeEnum(MediaKind),
  videoUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  url: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  title: z.string().optional(),
  titlePositionX: z.coerce.number().min(0).max(1).optional(),
  titlePositionY: z.coerce.number().min(0).max(1).optional(),
  caption: z.string().max(2200).optional(),
  description: z.string().max(2200).optional(),
  taggedUserId: z.string().min(1).optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.coerce.number().optional(),
});

const viewsSchema = z.object({
  mediaId: z.string(),
  reposted: z.boolean().optional(),
});

const updateSchema = z.object({
  mediaId: z.string(),
  title: z.string().max(300).optional(),
  caption: z.string().max(2200).optional(),
  description: z.string().max(2200).optional(),
  titlePositionX: z.coerce.number().min(0).max(1).optional(),
  titlePositionY: z.coerce.number().min(0).max(1).optional(),
});

const visibilitySchema = z.object({
  mediaId: z.string(),
  hidden: z.boolean(),
});

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const parsed = createSchema.parse(await request.json());
    const url = parsed.videoUrl || parsed.url || parsed.images?.[0];
    if (!url) {
      return NextResponse.json(
        { success: false, message: "A media URL is required" },
        { status: 400 },
      );
    }
    // Only persist images when there is more than one (a true carousel post).
    const images =
      parsed.images && parsed.images.length > 1 ? parsed.images : undefined;

    const isMainProfileKind =
      parsed.kind === MediaKind.PROFILE_VIDEO ||
      parsed.kind === MediaKind.PROFILE_IMAGE;
    const existingProfile = isMainProfileKind
      ? await prisma.userMedia.findFirst({
          where: {
            userId: session.userId,
            kind: { in: [MediaKind.PROFILE_VIDEO, MediaKind.PROFILE_IMAGE] },
          },
        })
      : null;
    const taggedUserId = parsed.taggedUserId?.trim() || "";
    if (taggedUserId === session.userId) {
      return NextResponse.json(
        { success: false, message: "You cannot tag yourself" },
        { status: 400 },
      );
    }
    const taggedUser =
      !isMainProfileKind && taggedUserId
        ? await prisma.user.findFirst({
            where: {
              id: taggedUserId,
              role: "USER",
              isActive: true,
              status: { notIn: ["BLOCKED", "HIDDEN"] },
              OR: [
                { externalId: null },
                { externalId: { not: { startsWith: "system:" } } },
              ],
            },
            select: { id: true, username: true, fullName: true },
          })
        : null;
    if (taggedUserId && !taggedUser) {
      return NextResponse.json(
        { success: false, message: "That account is not available to tag" },
        { status: 400 },
      );
    }

    const savedMedia = existingProfile
      ? await prisma.userMedia.update({
          where: { id: existingProfile.id },
          data: {
            kind: parsed.kind,
            url,
            thumbnailUrl: parsed.thumbnailUrl || url,
            title: parsed.title,
            titlePositionX: parsed.titlePositionX,
            titlePositionY: parsed.titlePositionY,
            caption: parsed.caption,
            description: parsed.description,
            taggedUserId: null,
            taggedUsername: null,
            taggedUserIds: Prisma.DbNull,
            taggedUsernames: Prisma.DbNull,
            tagApprovalStatus: null,
            mimeType: parsed.mimeType,
            sizeBytes: parsed.sizeBytes,
          },
        })
      : await prisma.userMedia.create({
          data: {
            userId: session.userId,
            kind: parsed.kind,
            url,
            images,
            thumbnailUrl: parsed.thumbnailUrl || url,
            title: parsed.title,
            titlePositionX: parsed.titlePositionX,
            titlePositionY: parsed.titlePositionY,
            caption: parsed.caption,
            description: parsed.description,
            taggedUserId: taggedUser?.id || null,
            taggedUsername:
              taggedUser?.username || taggedUser?.fullName || null,
            // Keep the legacy list fields coherent for older app versions,
            // while new posts intentionally support one pending tag only.
            taggedUserIds: taggedUser ? [taggedUser.id] : Prisma.DbNull,
            taggedUsernames: taggedUser
              ? [taggedUser.username || taggedUser.fullName]
              : Prisma.DbNull,
            tagApprovalStatus: taggedUser ? TagApprovalStatus.PENDING : null,
            mimeType: parsed.mimeType,
            sizeBytes: parsed.sizeBytes,
          },
        });

    if (
      !existingProfile &&
      (parsed.kind === MediaKind.GALLERY_VIDEO ||
        parsed.kind === MediaKind.IMAGE)
    ) {
      const [actor, followers] = await Promise.all([
        prisma.user.findUnique({
          where: { id: session.userId },
          select: { fullName: true, username: true },
        }),
        prisma.follow.findMany({
          where: {
            followedId: session.userId,
            follower: {
              isActive: true,
              status: { notIn: ["BLOCKED", "HIDDEN"] },
            },
          },
          select: { followerId: true },
        }),
      ]);
      const actorName =
        actor?.username?.trim() || actor?.fullName?.trim() || "Someone";
      await Promise.all(
        followers.map(async ({ followerId }) => {
          // Upload retries must not create a second activity card for the same post.
          const existingNotification = await prisma.userNotification.findFirst({
            where: {
              userId: followerId,
              senderId: session.userId,
              type: "postvideo",
              metadata: { path: "mediaId", equals: savedMedia.id },
            },
            select: { id: true },
          });
          if (existingNotification) return;
          await createUserNotification({
            userId: followerId,
            senderId: session.userId,
            type: "postvideo",
            title: actorName,
            message: "just posted",
            metadata: {
              mediaId: savedMedia.id,
              thumbnailUrl: savedMedia.thumbnailUrl || savedMedia.url,
            },
          });
        }),
      );
      if (taggedUser) {
        await createUserNotification({
          userId: taggedUser.id,
          senderId: session.userId,
          type: "post_tag",
          title: actorName,
          message: `${actorName} wants to tag you in a post`,
          metadata: {
            mediaId: savedMedia.id,
            thumbnailUrl: savedMedia.thumbnailUrl || savedMedia.url,
          },
        });
      }
    }

    const user = await findMobileUserById(session.userId);
    return NextResponse.json({
      success: true,
      mediaId: savedMedia.id,
      user: user ? serializeMobileUser(user) : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: error.issues[0]?.message ?? "Invalid request",
        },
        { status: 400 },
      );
    }
    logError("/api/mobile/profile/media", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to save media",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    if (body.action === "visibility") {
      const parsed = visibilitySchema.parse(body);
      const result = await prisma.userMedia.updateMany({
        where: { id: parsed.mediaId, userId: session.userId },
        data: { isHiddenByOwner: parsed.hidden },
      });
      if (!result.count) {
        return NextResponse.json(
          { success: false, message: "Post not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, hidden: parsed.hidden });
    }

    if (body.action === "repost") {
      const parsed = viewsSchema.parse(body);
      const result = await prisma.$transaction(async (tx) => {
        const media = await tx.userMedia.findUnique({
          where: { id: parsed.mediaId },
          select: { id: true, userId: true, isHiddenByOwner: true },
        });
        if (!media) throw new Error("Post not found");
        if (media.isHiddenByOwner) throw new Error("This post is hidden");

        const desired =
          typeof parsed.reposted === "boolean" ? parsed.reposted : undefined;
        const existing = await tx.mediaRepost.findUnique({
          where: {
            userId_mediaId: { userId: session.userId, mediaId: parsed.mediaId },
          },
        });
        const shouldRepost = desired ?? !existing;

        if (!shouldRepost) {
          if (existing) {
            await tx.mediaRepost.delete({ where: { id: existing.id } });
            const updated = await tx.userMedia.update({
              where: { id: parsed.mediaId },
              data: { repostCount: { decrement: 1 } },
              select: { repostCount: true },
            });
            return {
              reposted: false,
              repostCount: Math.max(0, updated.repostCount),
              ownerId: media.userId,
            };
          }
          const current = await tx.userMedia.findUnique({
            where: { id: parsed.mediaId },
            select: { repostCount: true },
          });
          return {
            reposted: false,
            repostCount: Math.max(0, current?.repostCount ?? 0),
            ownerId: media.userId,
          };
        }

        if (existing) {
          const current = await tx.userMedia.findUnique({
            where: { id: parsed.mediaId },
            select: { repostCount: true },
          });
          return {
            reposted: true,
            repostCount: Math.max(0, current?.repostCount ?? 0),
            ownerId: media.userId,
          };
        }

        await tx.mediaRepost.create({
          data: { userId: session.userId, mediaId: parsed.mediaId },
        });
        const updated = await tx.userMedia.update({
          where: { id: parsed.mediaId },
          data: { repostCount: { increment: 1 } },
          select: { repostCount: true },
        });
        return {
          reposted: true,
          repostCount: updated.repostCount,
          ownerId: media.userId,
        };
      });

      if (result.reposted && result.ownerId !== session.userId) {
        const actor = await prisma.user.findUnique({
          where: { id: session.userId },
          select: { fullName: true, username: true },
        });
        const actorName =
          actor?.fullName?.trim() || actor?.username?.trim() || "Someone";
        await createUserNotification({
          userId: result.ownerId,
          senderId: session.userId,
          type: "repost",
          title: actorName,
          message: `${actorName} reshared your post`,
          metadata: { mediaId: parsed.mediaId, ownerId: result.ownerId },
        });
      }
      return NextResponse.json({ success: true, ...result });
    }

    if (body.action === "share") {
      const parsed = viewsSchema.parse(body);
      const updated = await prisma.userMedia.update({
        where: { id: parsed.mediaId },
        data: { shareCount: { increment: 1 } },
        select: { shareCount: true },
      });
      return NextResponse.json({
        success: true,
        shareCount: updated.shareCount,
      });
    }

    const isMetadataUpdate = [
      "title",
      "caption",
      "description",
      "titlePositionX",
      "titlePositionY",
    ].some((field) => Object.prototype.hasOwnProperty.call(body, field));
    if (isMetadataUpdate) {
      const parsed = updateSchema.parse(body);
      const { mediaId, ...data } = parsed;
      const result = await prisma.userMedia.updateMany({
        where: { id: mediaId, userId: session.userId },
        data,
      });
      if (!result.count) {
        return NextResponse.json(
          { success: false, message: "Post not found" },
          { status: 404 },
        );
      }
      const user = await findMobileUserById(session.userId);
      return NextResponse.json({
        success: true,
        user: user ? serializeMobileUser(user) : null,
      });
    }

    const parsed = viewsSchema.parse(body);
    const viewOnly = body.viewOnly === true;

    await prisma.userMedia.update({
      where: { id: parsed.mediaId },
      data: { views: { increment: 1 } },
    });

    // Record that this user has seen the post so the discover feed can
    // prioritise fresh content. Best-effort — never block the view count.
    try {
      await prisma.discoverSeen.upsert({
        where: {
          userId_mediaId: { userId: session.userId, mediaId: parsed.mediaId },
        },
        create: { userId: session.userId, mediaId: parsed.mediaId },
        update: { seenAt: new Date() },
      });
    } catch {
      // ignore — seen tracking is non-critical
    }

    if (viewOnly) {
      return NextResponse.json({ success: true });
    }

    const user = await findMobileUserById(session.userId);
    return NextResponse.json({
      success: true,
      user: user ? serializeMobileUser(user) : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: error.issues[0]?.message ?? "Invalid request",
        },
        { status: 400 },
      );
    }
    logError("/api/mobile/profile/media", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update media",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const mediaId = url.searchParams.get("mediaId");

  if (!mediaId) {
    return NextResponse.json(
      { success: false, message: "mediaId is required" },
      { status: 400 },
    );
  }

  await prisma.userMedia.deleteMany({
    where: {
      id: mediaId,
      userId: session.userId,
    },
  });

  const user = await findMobileUserById(session.userId);
  return NextResponse.json({
    success: true,
    user: user ? serializeMobileUser(user) : null,
  });
}
