import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <Card className={`overflow-hidden ${className}`}>{children}</Card>
}

function ShimmerCardHeader({ wide = false }: { wide?: boolean }) {
  return (
    <CardHeader className="border-b border-border/60">
      <Skeleton className="h-4 w-28" />
      <Skeleton className={`h-3 ${wide ? "w-52" : "w-36"}`} />
    </CardHeader>
  )
}

export default function DashboardLoading() {
  return (
    <div className="space-y-5">

      {/* Greeting row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex w-fit items-center gap-4 rounded-lg border border-border bg-card px-5 py-3.5">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-7 w-10" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      </div>

      {/* Stat cards — keep gradient tints */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["from-violet-600/20 to-indigo-600/20", "from-rose-500/20 to-pink-600/20", "from-emerald-500/20 to-teal-600/20", "from-amber-500/20 to-orange-500/20"] as const).map((grad, i) => (
          <div key={i} className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${grad} p-5`}>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20 bg-white/30" />
              <Skeleton className="h-8 w-8 rounded-xl bg-white/30" />
            </div>
            <Skeleton className="mt-3 h-10 w-16 bg-white/30" />
            <Skeleton className="mt-2 h-2.5 w-36 bg-white/20" />
          </div>
        ))}
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* Main row: chart + status donut */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <CardShell>
          <ShimmerCardHeader wide />
          <CardContent className="pt-4">
            {/* Bar chart shimmer */}
            <div className="flex h-[200px] items-end gap-2 pb-6">
              {[30, 15, 20, 10, 25, 18, 12, 35, 22, 14, 28, 90].map((h, i) => (
                <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="flex justify-between">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-2.5 w-8" />
              ))}
            </div>
          </CardContent>
        </CardShell>

        <CardShell>
          <CardHeader className="border-b border-border/60">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="flex items-center gap-8 pt-4">
            <Skeleton className="h-[156px] w-[156px] shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-2.5 w-2.5 rounded-sm shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-6" />
                  <Skeleton className="h-3 w-7" />
                </div>
              ))}
            </div>
          </CardContent>
        </CardShell>
      </div>

      {/* Bottom grid */}
      <div className="grid gap-4 xl:grid-cols-3">

        {/* Recent users */}
        <CardShell>
          <CardHeader className="flex-row items-center justify-between border-b border-border/60">
            <div className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-12" />
          </CardHeader>
          <div className="divide-y divide-border/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </CardShell>

        {/* Top countries */}
        <CardShell>
          <ShimmerCardHeader />
          <CardContent className="space-y-4 pt-4">
            {[72, 55, 40, 28, 18].map((w, i) => (
              <div key={i}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-3 w-5" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3 w-5" />
                    <Skeleton className="h-3 w-7" />
                  </div>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <Skeleton className="h-full rounded-full" style={{ width: `${w}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </CardShell>

        {/* Gender + Platform */}
        <div className="space-y-4">
          <CardShell>
            <ShimmerCardHeader />
            <CardContent className="flex items-center gap-8 pt-4">
              <Skeleton className="h-[120px] w-[120px] shrink-0 rounded-full" />
              <div className="flex-1 space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-2.5 w-2.5 rounded-sm shrink-0" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-3 w-5" />
                    <Skeleton className="h-3 w-7" />
                  </div>
                ))}
              </div>
            </CardContent>
          </CardShell>

          <CardShell>
            <ShimmerCardHeader />
            <CardContent className="space-y-4 pt-4">
              {[100, 60].map((w, i) => (
                <div key={i}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Skeleton className="h-3.5 w-16" />
                    <div className="flex gap-2">
                      <Skeleton className="h-3 w-5" />
                      <Skeleton className="h-3 w-7" />
                    </div>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <Skeleton className="h-full rounded-full" style={{ width: `${w}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </CardShell>
        </div>
      </div>
    </div>
  )
}
