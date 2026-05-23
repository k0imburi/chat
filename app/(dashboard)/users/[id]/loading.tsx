import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function UserDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Moderation action bar */}
      <div className="flex items-center justify-end gap-2">
        <Skeleton className="h-9 w-72 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ── Sidebar ── */}
        <aside className="space-y-4 lg:w-80 lg:shrink-0">
          {/* Identity card */}
          <Card className="overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Skeleton className="h-24 w-24 rounded-lg" />
                <Skeleton className="mt-4 h-5 w-36" />
                <Skeleton className="mt-1.5 h-3.5 w-24" />
                <div className="mt-3 flex gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-18 rounded-full" />
                </div>
                {/* Quick stats */}
                <div className="mt-5 grid w-full grid-cols-3 divide-x divide-border/60 border-t border-border/60 pt-4">
                  {["Swipes", "Reports", "Media"].map((label) => (
                    <div key={label} className="flex flex-col items-center gap-1 px-2">
                      <Skeleton className="h-6 w-8" />
                      <Skeleton className="h-2.5 w-10" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Details card */}
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-14" />
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Contact section */}
              <div className="space-y-1">
                <Skeleton className="h-2.5 w-14" />
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                    <div className="space-y-1">
                      <Skeleton className="h-2.5 w-8" />
                      <Skeleton className="h-3.5 w-36" />
                    </div>
                  </div>
                ))}
              </div>
              {/* Personal section */}
              <div className="space-y-1">
                <Skeleton className="h-2.5 w-14" />
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                    <div className="space-y-1">
                      <Skeleton className="h-2.5 w-12" />
                      <Skeleton className="h-3.5 w-24" />
                    </div>
                  </div>
                ))}
              </div>
              {/* Account section */}
              <div className="space-y-1">
                <Skeleton className="h-2.5 w-14" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                    <div className="space-y-1">
                      <Skeleton className="h-2.5 w-10" />
                      <Skeleton className="h-3.5 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* ── Main ── */}
        <main className="min-w-0 flex-1 space-y-4">
          {/* Media card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3.5 w-12" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Profile video placeholder */}
              <Skeleton className="aspect-video w-full rounded-lg" />
              {/* Gallery grid */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-video w-full rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
