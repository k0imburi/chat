import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

const COLS = [12, 28, 18, 12, 14, 16] // % widths for column headers: #, Name, Contact, Location, Status, Verified, Last active

export default function UsersLoading() {
  return (
    <div className="space-y-5">
      {/* PageHeader */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* DataTable card */}
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-2.5 border-b border-border/60 px-5 py-3.5 sm:flex-row sm:items-center">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-16" />
        </div>

        <CardContent className="p-0">
          {/* Table header */}
          <div className="flex items-center gap-5 border-b border-border/60 bg-muted/40 px-5 py-2.5">
            <Skeleton className="h-3 w-5" />
            {["w-24", "w-20", "w-16", "w-14", "w-16", "w-20"].map((w, i) => (
              <Skeleton key={i} className={`h-3 ${w}`} />
            ))}
          </div>

          {/* Rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-5 border-b border-border/50 px-5 py-3.5 last:border-0">
              {/* # */}
              <Skeleton className="h-4 w-4 shrink-0" />
              {/* Name */}
              <Skeleton className="h-4 w-32 shrink-0" />
              {/* Contact */}
              <div className="w-44 shrink-0 space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              {/* Location */}
              <Skeleton className="h-4 w-28 shrink-0" />
              {/* Status */}
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              {/* Verified */}
              <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
              {/* Last active */}
              <Skeleton className="ml-auto h-3.5 w-24" />
            </div>
          ))}
        </CardContent>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-border/60 px-5 py-3.5 md:flex-row md:items-center md:justify-between">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        </div>
      </Card>
    </div>
  )
}
