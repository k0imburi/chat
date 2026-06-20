/**
 * Deploy-free inspection of the discover/explore ranking.
 *
 * Usage:
 *   DATABASE_URL="<external-url>" npx tsx scripts/inspect-discover.ts [userEmailOrId]
 *
 * Prints every gallery post (image + video) ranked exactly like the live
 * feed: unseen-first, then by the hot score. Use it to confirm fresh +
 * engaging posts rank highest, images are included, and seen posts sink.
 */
import { MediaKind, PrismaClient } from "@prisma/client"
import { hotScore } from "../lib/discover-score"

const prisma = new PrismaClient()

async function main() {
  const arg = process.argv[2]

  // Resolve the viewer whose feed we inspect.
  const viewer = arg
    ? await prisma.user.findFirst({
        where: { OR: [{ id: arg }, { email: arg }] },
      })
    : await prisma.user.findFirst({ where: { role: "USER" }, orderBy: { createdAt: "asc" } })

  if (!viewer) {
    console.error("No viewer found. Pass a user email or id as an argument.")
    process.exit(1)
  }

  const seenRows = await prisma.discoverSeen.findMany({
    where: { userId: viewer.id },
    select: { mediaId: true },
  })
  const seen = new Set(seenRows.map((r) => r.mediaId))

  // All gallery posts (image OR video) from other users.
  const posts = await prisma.userMedia.findMany({
    where: {
      kind: { in: [MediaKind.GALLERY_VIDEO, MediaKind.IMAGE] },
      userId: { not: viewer.id },
    },
    include: { user: { select: { fullName: true } } },
  })

  const now = Date.now()
  const ranked = posts
    .map((p) => {
      const ageH = (now - p.createdAt.getTime()) / 3_600_000
      const score = hotScore(p.likes, p.commentCount, p.views, p.createdAt, now)
      return {
        owner: p.user.fullName,
        kind: p.kind === MediaKind.IMAGE ? "IMG" : "VID",
        ageH,
        likes: p.likes,
        comments: p.commentCount,
        views: p.views,
        score,
        seen: seen.has(p.id),
      }
    })
    .sort((a, b) => {
      if (a.seen !== b.seen) return a.seen ? 1 : -1
      return b.score - a.score
    })

  console.log(`\nViewer: ${viewer.fullName} (${viewer.email ?? viewer.id})`)
  console.log(`Seen posts: ${seen.size} | Total candidate posts: ${posts.length}\n`)
  console.log(
    "rank  kind  age(h)   likes  cmts  views    score   seen  owner",
  )
  console.log("-".repeat(70))
  ranked.slice(0, 50).forEach((r, i) => {
    console.log(
      [
        String(i + 1).padStart(3),
        r.kind.padStart(5),
        r.ageH.toFixed(1).padStart(8),
        String(r.likes).padStart(6),
        String(r.comments).padStart(5),
        String(r.views).padStart(6),
        r.score.toFixed(4).padStart(9),
        (r.seen ? "yes" : "no").padStart(5),
        "  " + r.owner,
      ].join(" "),
    )
  })
  console.log("")
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
