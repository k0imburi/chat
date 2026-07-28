import { ActionForm } from "@/components/action-form"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveNotificationSoundAction } from "@/lib/actions/notification-sounds"

const bundled = [
  { assetKey: "cat_pulse", name: "Pulse", description: "A crisp two-note alert" },
  { assetKey: "cat_ripple", name: "Ripple", description: "A soft rising notification" },
  { assetKey: "cat_glow", name: "Glow", description: "A warm, rounded chime" },
  { assetKey: "cat_chime", name: "Chime", description: "A bright ChatAndTip alert" },
] as const

type Sound = {
  assetKey: string
  displayName: string
  description: string | null
  sortOrder: number
  isActive: boolean
  isDefault: boolean
}

export function NotificationSoundManager({ sounds }: { sounds: Sound[] }) {
  const current = new Map(sounds.map((sound) => [sound.assetKey, sound]))
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">ChatAndTip sounds</h2>
        <p className="text-sm text-muted-foreground">Control the bundled sounds shown in the mobile app.</p>
      </div>
      <div className="divide-y rounded-lg border">
        {bundled.map((asset, index) => {
          const sound = current.get(asset.assetKey)
          return (
            <ActionForm
              key={asset.assetKey}
              action={saveNotificationSoundAction}
              className="grid gap-3 p-4 md:grid-cols-[1fr_1.5fr_90px_auto_auto_auto] md:items-end"
            >
              <input type="hidden" name="assetKey" value={asset.assetKey} />
              <div className="space-y-1">
                <Label htmlFor={`${asset.assetKey}-name`}>Name</Label>
                <Input id={`${asset.assetKey}-name`} name="displayName" defaultValue={sound?.displayName ?? asset.name} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${asset.assetKey}-description`}>Description</Label>
                <Input id={`${asset.assetKey}-description`} name="description" defaultValue={sound?.description ?? asset.description} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${asset.assetKey}-order`}>Order</Label>
                <Input id={`${asset.assetKey}-order`} name="sortOrder" type="number" min="0" max="100" defaultValue={sound?.sortOrder ?? index} />
              </div>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={sound?.isActive ?? true} />
                Active
              </label>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={sound?.isDefault ?? index === 0} />
                Default
              </label>
              <SubmitButton size="sm">Save</SubmitButton>
            </ActionForm>
          )
        })}
      </div>
    </section>
  )
}
