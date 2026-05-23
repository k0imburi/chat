import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function PaymentPlansLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Plans table card */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Table header */}
          <div className="flex items-center gap-5 border-b border-border/60 bg-muted/40 px-5 py-2.5">
            {["w-36", "w-24", "w-24", "w-20", "w-20", "w-16"].map((w, i) => (
              <Skeleton key={i} className={`h-3 ${w}`} />
            ))}
          </div>

          {/* Rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-5 border-b border-border/50 px-5 py-3.5 last:border-0">
              {/* Name */}
              <Skeleton className="h-4 w-36 shrink-0" />
              {/* Code */}
              <Skeleton className="h-4 w-24 shrink-0" />
              {/* Amount */}
              <Skeleton className="h-4 w-16 shrink-0" />
              {/* Interval */}
              <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
              {/* Active */}
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
              {/* Actions */}
              <div className="ml-auto flex gap-2">
                <Skeleton className="h-8 w-14 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
