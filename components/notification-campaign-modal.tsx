"use client"

import { useState } from "react"
import { ActionForm } from "@/components/action-form"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createNotificationCampaignAction } from "@/lib/actions/notifications"
import { NOTIFICATION_CHANNEL_OPTIONS } from "@/lib/constants"

export function NotificationCampaignModal() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Send campaign</Button>
      </DialogTrigger>
      <DialogContent className="sm:w-[760px]">
        <ActionForm
          id="send-campaign-form"
          action={createNotificationCampaignAction}
          className="contents"
          onSuccess={() => setOpen(false)}
        >
          <DialogHeader>
            <DialogTitle>Send notification campaign</DialogTitle>
            <DialogDescription>
              Create a broadcast campaign for in-app, email, SMS, or webhook delivery.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notif-title">Title</Label>
                <Input id="notif-title" name="title" placeholder="Optional title" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel">Channel</Label>
                <select id="channel" name="channel" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  {NOTIFICATION_CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <textarea id="message" name="message" required className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="Write the campaign message to be delivered..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Audience</Label>
                <select id="audience" name="audience" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="all">All users</option>
                  <option value="fans">Fans only</option>
                  <option value="creators">Creators only</option>
                  <option value="verified">Verified users</option>
                  <option value="custom">Custom ID list</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="genderFilter">Gender filter (optional)</Label>
                <select id="genderFilter" name="genderFilter" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="">Any gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="createdAfter">Joined after (optional)</Label>
                <Input id="createdAfter" name="createdAfter" type="date" className="w-full" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userIds">Custom user IDs (comma-separated)</Label>
                <textarea id="userIds" name="userIds" className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="Only used when Audience = Custom ID list" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Schedule for (optional)</Label>
                <Input id="scheduledAt" name="scheduledAt" type="datetime-local" className="w-full" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton size="sm" pendingText="">
              Send campaign
            </SubmitButton>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
