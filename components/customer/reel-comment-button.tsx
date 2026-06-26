"use client"

import { MessageCircle } from "lucide-react"
import { CommentSheet, type CommentItem } from "@/components/customer/comment-sheet"

export function ReelCommentButton({
  mediaId,
  commentCount,
  comments,
  viewerAvatarUrl,
  viewerName,
  signedIn,
}: {
  mediaId: string
  commentCount: number
  comments: CommentItem[]
  viewerAvatarUrl?: string | null
  viewerName?: string | null
  signedIn: boolean
}) {
  return (
    <CommentSheet
      mediaId={mediaId}
      commentCount={commentCount}
      comments={comments}
      viewerAvatarUrl={viewerAvatarUrl}
      viewerName={viewerName}
      signedIn={signedIn}
      trigger={(openSheet) => (
        <button
          onClick={openSheet}
          className="flex flex-col items-center gap-1"
          aria-label="Open comments"
        >
          <div className="flex h-12 w-12 items-center justify-center">
            <MessageCircle className="h-[26px] w-[26px] text-white" />
          </div>
          <span className="text-xs font-bold text-white drop-shadow-sm">
            {commentCount.toLocaleString()}
          </span>
        </button>
      )}
    />
  )
}
