import { Badge } from "@/components/ui/badge"
import { ADMIN_BADGE_STYLES, STATUS_BADGE_STYLES } from "@/lib/constants"

export function StatusBadge({ value }: { value: string }) {
  return <Badge className={STATUS_BADGE_STYLES[value] ?? ""}>{value.replace(/_/g, " ")}</Badge>
}

export function RoleBadge({ value }: { value: string }) {
  return <Badge className={ADMIN_BADGE_STYLES[value] ?? ""}>{value.replace(/_/g, " ")}</Badge>
}
