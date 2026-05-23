"use client"

import { useState } from "react"
import { PlusCircle } from "lucide-react"
import { ActionForm } from "@/components/action-form"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createWalletAdjustmentAction } from "@/lib/actions/finance"

export function WalletAdjustmentModal({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="h-4 w-4" />
          Post adjustment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post wallet adjustment</DialogTitle>
          <DialogDescription>
            Record a real credit or debit directly against this wallet ledger.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ActionForm
            id="wallet-adjustment-form"
            action={createWalletAdjustmentAction}
            onSuccess={() => setOpen(false)}
            className="grid gap-4"
          >
            <input type="hidden" name="userId" value={userId} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="direction">Direction</Label>
                <select
                  id="direction"
                  name="direction"
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  defaultValue="credit"
                >
                  <option value="credit">Credit</option>
                  <option value="debit">Debit</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <textarea
                id="reason"
                name="reason"
                required
                className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="Explain the adjustment for audit purposes..."
              />
            </div>
          </ActionForm>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <SubmitButton form="wallet-adjustment-form">Post adjustment</SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
