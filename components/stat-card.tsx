import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string
  value: string | number
  icon: LucideIcon
  hint?: string
}) {
  return (
    <Card className="rounded-xl bg-muted/50 shadow-none">
      <CardContent className="flex items-start justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="rounded-xl bg-background/70 p-3 text-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}
