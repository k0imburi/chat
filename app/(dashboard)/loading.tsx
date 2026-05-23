import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function DashboardLayoutLoading() {
  return (
    <div className="space-y-5">
      {/* Generic page header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Generic card with table rows */}
      <Card className="overflow-hidden">
        <div className="border-b border-border/60 px-5 py-3.5">
          <Skeleton className="h-9 w-full max-w-sm" />
        </div>
        <CardContent className="p-0">
          <div className="flex items-center gap-5 border-b border-border/60 bg-muted/40 px-5 py-2.5">
            {["w-20", "w-28", "w-24", "w-20", "w-16"].map((w, i) => (
              <Skeleton key={i} className={`h-3 ${w}`} />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-5 border-b border-border/50 px-5 py-3.5 last:border-0">
              <Skeleton className="h-4 w-28 shrink-0" />
              <Skeleton className="h-4 w-36 shrink-0" />
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              <Skeleton className="ml-auto h-3.5 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
