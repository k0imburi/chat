"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { deliverCampaignNowAction } from "@/lib/actions/notifications"
import { toast } from "sonner"
import { LoaderCircle } from "lucide-react"

export function DeliverNowButton({ campaignId }: { campaignId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await deliverCampaignNowAction(campaignId)
          if (result.success) {
            toast.success(result.message ?? "Delivered")
          } else {
            toast.error(result.message ?? "Delivery failed")
          }
        })
      }
    >
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Deliver now"}
    </Button>
  )
}
