import "server-only"

import { MediaKind, UserRole } from "@prisma/client"
import { createUserNotification } from "@/lib/mobile-notifications"
import { prisma } from "@/lib/prisma"

const COMMENTS_PAGE_SIZE = 20

const authorSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  media: { where: { kind: MediaKind.PROFILE_VIDEO }, select: { thumbnailUrl: true, url: true }, take: 1 },
} as const

type CommentAuthor = {
  id: string
  fullName: string
  avatarUrl: string | null
  media: { thumbnailUrl: string | null; url: string }[]
}

function resolveAvatarUrl(author: CommentAuthor): string {
  // Mirror serializeMobileUser: avatarUrl → thumbnailUrl → url (video URL as last resort)
  return (
    author.avatarUrl ||
    author.media[0]?.thumbnailUrl ||
    author.media[0]?.url ||
    ""
  )
}

function serializeComment(
  comment: {
    id: string
    text: string
    parentId: string | null
    likes: number
    createdAt: Date
    author: CommentAuthor
    _count: { replies: number }
  },
  currentUserId: string,
  likedCommentIds: Set<string>,
) {
  return {
    id: comment.id,
    text: comment.text,
    parentId: comment.parentId,
    likes: comment.likes,
    replyCount: comment._count.replies,
    isLiked: likedCommentIds.has(comment.id),
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      name: comment.author.fullName,
      avatarUrl: resolveAvatarUrl(comment.author),
      isByCurrentUser: comment.author.id === currentUserId,
    },
  }
}

export async function getComments(
  mediaId: string,
  currentUserId: string,
  cursor?: string,
) {
  const rawComments = await prisma.videoComment.findMany({
    where: { mediaId, parentId: null },
    take: COMMENTS_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: authorSelect },
      _count: { select: { replies: true } },
    },
  })

  const hasMore = rawComments.length > COMMENTS_PAGE_SIZE
  const comments = hasMore ? rawComments.slice(0, COMMENTS_PAGE_SIZE) : rawComments

  const commentIds = comments.map((c) => c.id)
  const likedRows = await prisma.commentLike.findMany({
    where: { commentId: { in: commentIds }, userId: currentUserId },
    select: { commentId: true },
  })
  const likedIds = new Set(likedRows.map((r) => r.commentId))

  return {
    comments: comments.map((c) => serializeComment(c, currentUserId, likedIds)),
    nextCursor: hasMore ? comments[comments.length - 1].id : null,
  }
}

export async function getReplies(
  parentId: string,
  currentUserId: string,
) {
  const rawReplies = await prisma.videoComment.findMany({
    where: { parentId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: authorSelect },
      _count: { select: { replies: true } },
    },
  })

  const replyIds = rawReplies.map((r) => r.id)
  const likedRows = await prisma.commentLike.findMany({
    where: { commentId: { in: replyIds }, userId: currentUserId },
    select: { commentId: true },
  })
  const likedIds = new Set(likedRows.map((r) => r.commentId))

  return rawReplies.map((r) => serializeComment(r, currentUserId, likedIds))
}

export async function createComment(
  mediaId: string,
  authorId: string,
  text: string,
  parentId?: string,
) {
  const media = await prisma.userMedia.findUnique({
    where: { id: mediaId },
    select: { userId: true },
  })
  if (!media) throw new Error("Video not found")

  const comment = await prisma.videoComment.create({
    data: { mediaId, authorId, text, parentId: parentId ?? null },
    include: {
      author: { select: authorSelect },
      _count: { select: { replies: true } },
    },
  })

  await prisma.userMedia.update({
    where: { id: mediaId },
    data: { commentCount: { increment: 1 } },
  })

  // Notify the video owner (skip self-comments and guard against duplicate delivery)
  if (media.userId !== authorId) {
    const alreadyNotified = await prisma.userNotification.findFirst({
      where: { userId: media.userId, type: "comment", metadata: { path: "$.commentId", equals: comment.id } },
      select: { id: true },
    })
    if (!alreadyNotified) {
      await createUserNotification({
        userId: media.userId,
        senderId: authorId,
        type: "comment",
        title: `${comment.author.fullName} commented on your post`,
        message: text,
        metadata: { videoId: mediaId, commentId: comment.id },
      })
    }
  }

  return serializeComment(comment, authorId, new Set())
}

export async function deleteComment(commentId: string, requesterId: string) {
  const comment = await prisma.videoComment.findUnique({
    where: { id: commentId },
    select: { authorId: true, mediaId: true, parentId: true },
  })
  if (!comment) throw new Error("Comment not found")

  const media = await prisma.userMedia.findUnique({
    where: { id: comment.mediaId },
    select: { userId: true },
  })

  const isAuthor = comment.authorId === requesterId
  const isVideoOwner = media?.userId === requesterId

  if (!isAuthor && !isVideoOwner) {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    })
    if (requester?.role !== UserRole.ADMIN && requester?.role !== UserRole.SUPER_ADMIN) {
      throw new Error("Not authorised to delete this comment")
    }
  }

  // Count comment + all its replies before deleting (for commentCount decrement)
  const replyCount = await prisma.videoComment.count({ where: { parentId: commentId } })
  await prisma.videoComment.delete({ where: { id: commentId } })

  await prisma.userMedia.update({
    where: { id: comment.mediaId },
    data: { commentCount: { decrement: 1 + replyCount } },
  })
}

export async function toggleCommentLike(commentId: string, userId: string) {
  const existing = await prisma.commentLike.findUnique({
    where: { commentId_userId: { commentId, userId } },
  })

  if (existing) {
    await prisma.commentLike.delete({ where: { commentId_userId: { commentId, userId } } })
    await prisma.videoComment.update({
      where: { id: commentId },
      data: { likes: { decrement: 1 } },
    })
    const updated = await prisma.videoComment.findUnique({ where: { id: commentId }, select: { likes: true } })
    return { liked: false, likes: updated?.likes ?? 0 }
  }

  await prisma.commentLike.create({ data: { commentId, userId } })
  await prisma.videoComment.update({
    where: { id: commentId },
    data: { likes: { increment: 1 } },
  })
  const updated = await prisma.videoComment.findUnique({ where: { id: commentId }, select: { likes: true } })
  return { liked: true, likes: updated?.likes ?? 0 }
}
