"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { deliverCampaignNowAction } from "@/lib/actions/notifications"
import { toast } from "sonner"

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
      {pending ? "Delivering…" : "Deliver now"}
    </Button>
  )
}
