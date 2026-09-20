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
  taggedUserId: z.string().min(1).optional(), // legacy client support
  taggedUserIds: z.array(z.string().min(1)).max(5).optional(),
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
  taggedUserIds: z.array(z.string().min(1)).max(5).optional(),
});

const visibilitySchema = z.object({
  mediaId: z.string(),
  hidden: z.boolean(),
});

const tagUserSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  gender: true,
  verified: true,
  accountType: true,
  entityVerification: true,
  entityBadgeColor: true,
} as const;

function normalizedTagIds(ids: string[], ownerId: string) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length > 5) throw new Error("You can tag up to 5 people");
  if (unique.includes(ownerId)) throw new Error("You cannot tag yourself");
  return unique;
}

async function resolveTaggedUsers(ids: string[], ownerId: string) {
  const tagIds = normalizedTagIds(ids, ownerId);
  if (!tagIds.length) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: tagIds },
      role: "USER",
      isActive: true,
      status: { notIn: ["BLOCKED", "HIDDEN"] },
      OR: [
        { externalId: null },
        { externalId: { not: { startsWith: "system:" } } },
      ],
    },
    select: tagUserSelect,
  });
  if (users.length !== tagIds.length) {
    throw new Error("One or more accounts are not available to tag");
  }
  return tagIds.map((id) => users.find((user) => user.id === id)!);
}

function tagFields(users: Awaited<ReturnType<typeof resolveTaggedUsers>>) {
  const ids = users.map((user) => user.id);
  const names = users.map((user) => user.fullName || user.username || "");
  const statuses = Object.fromEntries(ids.map((id) => [id, "PENDING"]));
  return {
    taggedUserId: ids[0] || null,
    taggedUsername: names[0] || null,
    taggedUserIds: ids.length ? ids : Prisma.DbNull,
    taggedUsernames: names.length ? names : Prisma.DbNull,
    taggedUserPreviews: users.length
      ? users.map((user) => ({
          id: user.id,
          name: user.fullName || user.username || "",
          avatarUrl: user.avatarUrl || "",
          fallbackAsset:
            user.gender?.toUpperCase() === "M"
              ? "assets/male.png"
              : "assets/female.png",
          isVerified: user.verified,
          isEntity: user.accountType === "ENTITY",
          entityVerification: user.entityVerification.toLowerCase(),
          entityBadgeColor: user.entityBadgeColor || "",
        }))
      : Prisma.DbNull,
    tagApprovalStatuses: ids.length ? statuses : Prisma.DbNull,
    tagApprovalStatus: ids.length ? TagApprovalStatus.PENDING : null,
  };
}

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
    const requestedTagIds =
      parsed.taggedUserIds ??
      (parsed.taggedUserId ? [parsed.taggedUserId] : []);
    const taggedUsers = isMainProfileKind
      ? []
      : await resolveTaggedUsers(requestedTagIds, session.userId);

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
            taggedUserPreviews: Prisma.DbNull,
            tagApprovalStatuses: Prisma.DbNull,
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
            ...tagFields(taggedUsers),
            mimeType: parsed.mimeType,
            sizeBytes: parsed.sizeBytes,
          },
        });

    if (
      !existingProfile &&
      (parsed.kind === MediaKind.GALLERY_VIDEO ||
        parsed.kind === MediaKind.IMAGE)
    ) {
      // The post is already durable. Activity notifications must never change
      // that result into a 500 or encourage the creator to post it again.
      try {
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
            const existingNotification =
              await prisma.userNotification.findFirst({
                where: {
                  userId: followerId,
                  senderId: session.userId,
                  type: "postvideo",
                  metadata: { path: "$.mediaId", equals: savedMedia.id },
                },
                select: { id: true },
              });
            if (existingNotification) return;
            await createUserNotification({
              userId: followerId,
              senderId: session.userId,
              type: "postvideo",
              title: actorName,
              message: "added a new post",
              metadata: {
                mediaId: savedMedia.id,
                thumbnailUrl: savedMedia.thumbnailUrl || savedMedia.url,
              },
            });
          }),
        );
        for (const taggedUser of taggedUsers) {
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
      } catch (error) {
        logError("/api/mobile/profile/media notifications", error);
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
      "taggedUserIds",
    ].some((field) => Object.prototype.hasOwnProperty.call(body, field));
    if (isMetadataUpdate) {
      const parsed = updateSchema.parse(body);
      const { mediaId, taggedUserIds, ...metadata } = parsed;
      const hasTagUpdate = Object.prototype.hasOwnProperty.call(
        body,
        "taggedUserIds",
      );
      const taggedUsers = hasTagUpdate
        ? await resolveTaggedUsers(taggedUserIds ?? [], session.userId)
        : [];
      const data = {
        ...metadata,
        ...(hasTagUpdate ? tagFields(taggedUsers) : {}),
      };
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
      if (hasTagUpdate && taggedUsers.length) {
        const [actor, media] = await Promise.all([
          prisma.user.findUnique({
            where: { id: session.userId },
            select: { fullName: true, username: true },
          }),
          prisma.userMedia.findUnique({
            where: { id: mediaId },
            select: { thumbnailUrl: true, url: true },
          }),
        ]);
        const actorName =
          actor?.username?.trim() || actor?.fullName?.trim() || "Someone";
        await Promise.all(
          taggedUsers.map((taggedUser) =>
            createUserNotification({
              userId: taggedUser.id,
              senderId: session.userId,
              type: "post_tag",
              title: actorName,
              message: `${actorName} wants to tag you in a post`,
              metadata: {
                mediaId,
                thumbnailUrl: media?.thumbnailUrl || media?.url || "",
              },
            }),
          ),
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
