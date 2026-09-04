import "server-only";

import { prisma } from "@/lib/prisma";
import {
  languageTokens,
  serializeMobileUserWithLikes,
} from "@/lib/mobile-users";
import { FEED_LIMIT, hotScore } from "@/lib/discover-score";

// Stable non-cryptographic hash for a string — used to tiebreak trending.
function idHashFraction(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

export async function getDiscoverFeed(currentUserId: string) {
  const [currentUser, followRows, seenRows, savedRows, repostRows] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: currentUserId },
        include: {
          media: true,
          blockedUsers: true,
          blockedByUsers: true,
          sentLikes: true,
          sentSwipes: true,
        },
      }),
      prisma.follow.findMany({
        where: { followerId: currentUserId },
        select: { followedId: true },
      }),
      prisma.discoverSeen.findMany({
        where: { userId: currentUserId },
        select: { mediaId: true },
      }),
      prisma.savedVideo.findMany({
        where: { userId: currentUserId },
        select: { mediaId: true },
      }),
      prisma.mediaRepost.findMany({
        where: { userId: currentUserId },
        select: { mediaId: true },
      }),
    ]);

  if (!currentUser) {
    throw new Error("Current user not found");
  }

  const seenMediaIds = new Set(seenRows.map((row) => row.mediaId));
  const savedMediaIds = new Set(savedRows.map((row) => row.mediaId));
  const repostedMediaIds = new Set(repostRows.map((row) => row.mediaId));
  const followedIds = followRows.map((r) => r.followedId);

  const blockedIds = new Set<string>([
    ...currentUser.blockedUsers.map((item) => item.blockedId),
    ...currentUser.blockedByUsers.map((item) => item.blockerId),
  ]);

  const likedMediaIds = new Set(
    currentUser.sentLikes
      .map((item) => item.mediaId)
      .filter((value): value is string => Boolean(value)),
  );
  const swipedIds = new Set(
    currentUser.sentSwipes.map((item) => item.receiverId),
  );

  // Discover shows EVERYONE (minus blocked), ordered followed-first then the
  // rest — so the feed never dead-ends after you've seen your follows' posts.
  const followedSet = new Set(followedIds);
  const candidates = await prisma.user.findMany({
    where: {
      status: { notIn: ["BLOCKED", "HIDDEN"] },
      id: { not: currentUserId },
    },
    include: { media: true },
    orderBy: { createdAt: "desc" },
  });

  const filteredUsers = candidates.filter((candidate) => {
    if (blockedIds.has(candidate.id)) return false;
    if (swipedIds.has(candidate.id)) return false;
    // Keep anyone with at least one gallery post (video OR image).
    return candidate.media.some(
      (item) => item.kind === "GALLERY_VIDEO" || item.kind === "IMAGE",
    );
  });

  const now = Date.now();
  const viewerLangs = languageTokens(currentUser.language);

  // Build one feed entry per gallery post, scored by the hot algorithm.
  const entries = filteredUsers
    .map((user) => {
      const serialized = serializeMobileUserWithLikes(
        user,
        likedMediaIds,
        savedMediaIds,
        repostedMediaIds,
      );
      const videos = (
        Array.isArray(serialized.gallery)
          ? (serialized.gallery as Array<Record<string, unknown>>)
          : []
      ).filter((v) => !v.copyrightStatus && !v.reportStatus); // hide copyright-flagged & reported posts
      // Strip gallery from the user profile — the app only needs avatar/name,
      // not the full post list. Keeps the response payload small.
      const { gallery: _g, ...userProfile } = serialized;
      const followed = followedSet.has(user.id);
      // Shared spoken language (token overlap) softly boosts a creator.
      const sameLang = [...languageTokens(user.language)].some((t) =>
        viewerLangs.has(t),
      );
      return videos.map((video) => {
        const id = String(video.id || "");
        const createdAt = new Date(String(video.createdAt || now));
        return {
          user: userProfile,
          video,
          _followed: followed,
          _sameLang: sameLang,
          _seen: id ? seenMediaIds.has(id) : false,
          _createdAt: createdAt.getTime(),
          _rand: Math.random(),
        };
      });
    })
    .flat();

  const repostFeedRows = followedIds.length
    ? await prisma.mediaRepost.findMany({
        where: {
          userId: { in: followedIds },
          media: {
            userId: { not: currentUserId },
            kind: { in: ["GALLERY_VIDEO", "IMAGE"] },
            copyrightStatus: null,
            reportStatus: null,
          },
        },
        include: {
          user: true,
          media: { include: { user: { include: { media: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: FEED_LIMIT,
      })
    : [];

  const existingEntryIds = new Set(
    entries.map((entry) => String(entry.video.id || "")),
  );
  for (const repost of repostFeedRows) {
    if (blockedIds.has(repost.userId) || blockedIds.has(repost.media.userId))
      continue;
    const serializedOwner = serializeMobileUserWithLikes(
      repost.media.user,
      likedMediaIds,
      savedMediaIds,
      repostedMediaIds,
    );
    const ownerGallery = Array.isArray(serializedOwner.gallery)
      ? (serializedOwner.gallery as Array<Record<string, unknown>>)
      : [];
    const video = ownerGallery.find(
      (item) => String(item.id || "") === repost.mediaId,
    );
    if (!video) continue;
    const reshareAttribution = {
      resharedById: repost.user.id,
      resharedByName: repost.user.fullName || repost.user.username || "Someone",
      resharedAt: repost.createdAt.toISOString(),
    };
    const existingEntry = entries.find(
      (entry) => String(entry.video.id || "") === repost.mediaId,
    );
    if (existingEntry) {
      existingEntry.video = { ...existingEntry.video, ...reshareAttribution };
      existingEntry._followed = true;
      existingEntry._sameLang = true;
      existingEntry._createdAt = Math.max(
        existingEntry._createdAt,
        repost.createdAt.getTime(),
      );
      continue;
    }
    if (existingEntryIds.has(repost.mediaId)) continue;
    const { gallery: _gallery, ...ownerProfile } = serializedOwner;
    entries.push({
      user: ownerProfile,
      video: {
        ...video,
        ...reshareAttribution,
      },
      _followed: true,
      _sameLang: true,
      _seen: seenMediaIds.has(repost.mediaId),
      _createdAt: repost.createdAt.getTime(),
      _rand: Math.random(),
    });
    existingEntryIds.add(repost.mediaId);
  }

  const entryMediaIds = entries
    .map((entry) => String((entry.video as Record<string, unknown>).id || ""))
    .filter(Boolean);
  if (entryMediaIds.length) {
    const recentReposts = await prisma.mediaRepost.findMany({
      where: { mediaId: { in: [...new Set(entryMediaIds)] } },
      include: { user: { include: { media: true } } },
      orderBy: { createdAt: "desc" },
      take: entryMediaIds.length * 4,
    });
    const repostersByMedia = new Map<string, Array<Record<string, unknown>>>();
    for (const repost of recentReposts) {
      const list = repostersByMedia.get(repost.mediaId) || [];
      if (list.length >= 2) continue;
      const profileMedia = repost.user.media
        .filter(
          (item) =>
            item.kind === "PROFILE_IMAGE" || item.kind === "PROFILE_VIDEO",
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const rawAvatar =
        repost.user.avatarUrl ||
        profileMedia?.thumbnailUrl ||
        profileMedia?.url ||
        "";
      const avatarUrl = rawAvatar
        ? `${rawAvatar}${rawAvatar.includes("?") ? "&" : "?"}v=${repost.user.updatedAt.getTime()}`
        : "";
      list.push({
        id: repost.user.id,
        name: repost.user.fullName || repost.user.username || "Someone",
        username: repost.user.username || "",
        avatarUrl,
        fallbackAsset:
          repost.user.gender?.toUpperCase() === "M"
            ? "assets/male.png"
            : "assets/female.png",
      });
      repostersByMedia.set(repost.mediaId, list);
    }
    for (const entry of entries) {
      const video = entry.video as Record<string, unknown>;
      const id = String(video.id || "");
      const reposters = repostersByMedia.get(id);
      if (reposters?.length) video.recentReposters = reposters;
    }
  }

  // Discover ordering: followed creators first (unseen → newest first), then
  // everyone else in a fresh random order each load. This keeps the feed
  // personal at the top, never dead-ends when follows run out, and is always
  // visibly different from Trending (which ranks purely by the hot-score
  // algorithm) — no engagement/hotScore sorting here.
  entries.sort((a, b) => {
    if (a._followed !== b._followed) return a._followed ? -1 : 1;
    // Prefer creators who share the viewer's language (soft bias, not a hard
    // filter — a thin same-language pool must never empty the feed).
    if (a._sameLang !== b._sameLang) return a._sameLang ? -1 : 1;
    if (a._seen !== b._seen) return a._seen ? 1 : -1;
    if (a._followed) return b._createdAt - a._createdAt;
    return a._rand - b._rand;
  });

  // Strip internal scoring fields before returning.
  return entries
    .slice(0, FEED_LIMIT)
    .map(({ user, video }) => ({ user, video }));
}

export async function getTrendingFeed(currentUserId?: string) {
  const [users, savedRows, likedRows, repostRows] = await Promise.all([
    prisma.user.findMany({
      where: {
        status: { notIn: ["BLOCKED", "HIDDEN"] },
      },
      include: { media: true },
    }),
    currentUserId
      ? prisma.savedVideo.findMany({
          where: { userId: currentUserId },
          select: { mediaId: true },
        })
      : Promise.resolve([]),
    currentUserId
      ? prisma.videoLike.findMany({
          where: { senderId: currentUserId },
          select: { mediaId: true },
        })
      : Promise.resolve([]),
    currentUserId
      ? prisma.mediaRepost.findMany({
          where: { userId: currentUserId },
          select: { mediaId: true },
        })
      : Promise.resolve([]),
  ]);

  const savedMediaIds = new Set(savedRows.map((row) => row.mediaId));
  const likedMediaIds = new Set(
    likedRows
      .map((row) => row.mediaId)
      .filter((value): value is string => Boolean(value)),
  );
  const repostedMediaIds = new Set(repostRows.map((row) => row.mediaId));

  const now = Date.now();
  const entries = users
    .flatMap((user) => {
      const serialized = serializeMobileUserWithLikes(
        user,
        likedMediaIds,
        savedMediaIds,
        repostedMediaIds,
      );
      const videos = (
        Array.isArray(serialized.gallery)
          ? (serialized.gallery as Array<Record<string, unknown>>)
          : []
      ).filter((v) => !v.copyrightStatus && !v.reportStatus); // hide copyright-flagged & reported posts
      const { gallery: _g, ...userProfile } = serialized;
      return videos.map((video) => {
        // Trending is ranked strictly by the hot-score algorithm (engagement
        // blended with recency). This is deliberately a different ordering
        // from discover's following-first / freshness sort, so swapping tabs
        // shows visibly different content. ID hash tiebreaks equal scores.
        const createdAt = new Date(String(video.createdAt ?? now));
        const score = hotScore(
          Number(video.likes ?? 0),
          Number(video.commentCount ?? 0),
          Number(video.views ?? 0),
          createdAt,
          now,
        );
        const tiebreak = idHashFraction(String(video.id ?? "")) * 1e-6;
        return { user: userProfile, video, _score: score + tiebreak };
      });
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, FEED_LIMIT)
    .map(({ user, video }) => ({ user, video }));

  return entries;
}
