import { BadgeCheck } from "lucide-react"

// Blue check = admin-verified creator. Gold check = the official/broadcast
// account. Renders nothing when neither applies.
export function VerifiedBadge({
  verified,
  isBroadcaster,
  className = "h-4 w-4",
}: {
  verified?: boolean | number
  isBroadcaster?: boolean
  className?: string
}) {
  if (isBroadcaster) {
    return <BadgeCheck className={`${className} shrink-0 fill-amber-400 text-black`} aria-label="Official account" />
  }
  if (verified) {
    return <BadgeCheck className={`${className} shrink-0 fill-blue-500 text-white`} aria-label="Verified" />
  }
  return null
}
