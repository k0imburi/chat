import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function NotificationsLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* DataTable card — Campaign / Message / Status / Sent by / Date */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-5 border-b border-border/60 bg-muted/40 px-5 py-2.5">
            {["w-36", "w-56", "w-20", "w-24", "w-28"].map((w, i) => (
              <Skeleton key={i} className={`h-3 ${w}`} />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-5 border-b border-border/50 px-5 py-3.5 last:border-0">
              <div className="w-36 shrink-0 space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="w-56 shrink-0 space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-4 w-28 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
