import { Flame, ImageIcon, Video, Eye } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { ExploreInsightsTable } from "@/components/explore-insights-table"
import { getExploreInsights } from "@/lib/explore-insights"

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  gradient,
}: {
  title: string
  value: string
  hint: string
  icon: typeof Flame
  gradient: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${gradient} p-5 text-white`}>
      <div className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-5 right-1 h-20 w-20 rounded-full bg-white/5" />
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-white/75">{title}</p>
        <Icon className="h-4 w-4 text-white/60" />
      </div>
      <p className="relative mt-3 text-4xl font-bold tabular-nums">{value}</p>
      <p className="relative mt-2 text-[11px] text-white/60">{hint}</p>
    </div>
  )
}

export default async function ExploreInsightsPage() {
  const data = await getExploreInsights()
  const { weights, summary, posts } = data

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Algorithm"
        title="Explore ranking"
        description="How the discover feed ranks posts right now. Posts are ordered by a hot score that blends engagement with recency; unseen posts are shown before seen ones per viewer."
      />

      {/* Formula */}
      <div className="rounded-lg border bg-muted/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scoring formula</p>
        <p className="mt-2 font-mono text-sm">
          engagement = likes×{weights.like} + comments×{weights.comment} + views×{weights.view}
        </p>
        <p className="mt-1 font-mono text-sm">
          score = (engagement + 1) / (ageHours + 2)<sup>{weights.gravity}</sup>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Higher gravity favours fresher posts. Feed is capped at {weights.limit} posts per request.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total posts"
          value={summary.totalPosts.toLocaleString()}
          hint={`${summary.videos} videos · ${summary.images} images`}
          icon={Flame}
          gradient="from-rose-600 to-orange-600"
        />
        <SummaryCard
          title="Images"
          value={summary.images.toLocaleString()}
          hint="Now included in the feed (were excluded before)"
          icon={ImageIcon}
          gradient="from-violet-600 to-indigo-600"
        />
        <SummaryCard
          title="Total views"
          value={summary.totalViews.toLocaleString()}
          hint={`${summary.totalLikes} likes · ${summary.totalComments} comments`}
          icon={Video}
          gradient="from-sky-600 to-cyan-600"
        />
        <SummaryCard
          title="Seen records"
          value={summary.seenRecords.toLocaleString()}
          hint={`${summary.viewersTracked} viewers tracked`}
          icon={Eye}
          gradient="from-emerald-600 to-teal-600"
        />
      </div>

      {/* Ranked table — filterable, sortable, paginated */}
      <ExploreInsightsTable posts={posts} />
    </div>
  )
}
