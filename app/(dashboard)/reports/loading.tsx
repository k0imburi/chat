import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function ReportsLoading() {
  return (
    <div className="space-y-5">
      {/* PageHeader */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* DataTable card */}
      <Card className="overflow-hidden">
        {/* Search toolbar */}
        <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3.5">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-20" />
        </div>

        <CardContent className="p-0">
          {/* Table header */}
          <div className="flex items-center gap-5 border-b border-border/60 bg-muted/40 px-5 py-2.5">
            {["w-28", "w-24", "flex-1", "w-28", "w-16"].map((w, i) => (
              <Skeleton key={i} className={`h-3 ${w}`} />
            ))}
          </div>

          {/* Rows */}
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-start gap-5 border-b border-border/50 px-5 py-3.5 last:border-0">
              {/* Reported user */}
              <Skeleton className="mt-0.5 h-4 w-28 shrink-0" />
              {/* Reported by */}
              <Skeleton className="mt-0.5 h-4 w-24 shrink-0" />
              {/* Message */}
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
              {/* Date */}
              <Skeleton className="mt-0.5 h-3.5 w-28 shrink-0" />
              {/* Action */}
              <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
