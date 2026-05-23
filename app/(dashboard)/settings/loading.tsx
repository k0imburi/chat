import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

function FieldSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  )
}

function SectionCard({ fields = 2 }: { fields?: number }) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: fields }).map((_, i) => <FieldSkeleton key={i} />)}
        </div>
      </CardContent>
    </Card>
  )
}

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
        {["w-20", "w-20", "w-24", "w-20", "w-20", "w-16"].map((w, i) => (
          <Skeleton key={i} className={`h-8 ${w} rounded-md`} />
        ))}
      </div>

      {/* Section cards — mirrors the payments 2-col layout */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <SectionCard fields={4} />
          <SectionCard fields={2} />
        </div>
        <SectionCard fields={6} />
      </div>
    </div>
  )
}
