// Pure scoring helpers for the discover/explore feed.
// No "server-only" or DB imports here so this can be unit-tested and used
// by inspection scripts (run with tsx) as well as the server feed.

// Keep the initial response small enough for Flutter web to decode and paint
// promptly on mobile browsers. The previous 150-item payload was routinely
// over 600 KB before media began loading and made the UI appear frozen.
export const FEED_LIMIT = 40

// Engagement weights for the "hot" score.
export const W_LIKE = 3
export const W_COMMENT = 5
export const W_VIEW = 0.1
export const GRAVITY = 1.5

/**
 * Hot score: blends engagement with recency so fresh AND popular posts rank
 * highest. Brand-new posts still surface via the low age term.
 *   engagement = likes*3 + comments*5 + views*0.1
 *   score      = (engagement + 1) / (ageHours + 2)^1.5
 */
export function hotScore(
  likes: number,
  comments: number,
  views: number,
  createdAt: Date,
  now: number,
) {
  const engagement = likes * W_LIKE + comments * W_COMMENT + views * W_VIEW
  const ageHours = Math.max(0, (now - createdAt.getTime()) / 3_600_000)
  return (engagement + 1) / Math.pow(ageHours + 2, GRAVITY)
}
