import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/page-header"
import { AppModal } from "@/components/app-modal"
import { deletePaymentPlanAction, upsertPaymentPlanAction } from "@/lib/actions/payment-plans"
import { PLAN_INTERVAL_OPTIONS } from "@/lib/constants"
import { formatCurrency } from "@/lib/format"
import { getPaymentPlans } from "@/lib/queries"

export default async function PaymentPlansPage() {
  const plans = await getPaymentPlans()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monetization"
        title="Payment plans"
        description="Manage premium plans, billing cadence, pricing, and availability from a single administrative workspace."
        actions={
          <AppModal
            trigger={<Button>Create plan</Button>}
            title="Create payment plan"
            description="Define pricing, interval, and feature entitlements for a premium offering."
            footer={
              <Button type="submit" form="create-plan-form" size="sm">
                Save plan
              </Button>
            }
          >
            <form id="create-plan-form" action={upsertPaymentPlanAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="VIP Monthly" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" name="code" placeholder="vip-monthly" required />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" name="currency" defaultValue="USD" required />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="interval">Interval</Label>
                  <select id="interval" name="interval" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                    {PLAN_INTERVAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intervalCount">Interval count</Label>
                  <Input id="intervalCount" name="intervalCount" type="number" min="1" defaultValue="1" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea id="description" name="description" className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="features">Features</Label>
                <textarea
                  id="features"
                  name="features"
                  placeholder={"Unlimited swipes\nPriority visibility\nFeatured badge"}
                  className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sortOrder">Sort order</Label>
                <Input id="sortOrder" name="sortOrder" type="number" defaultValue="0" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-input" />
                Active plan
              </label>
            </form>
          </AppModal>
        }
      />

      <div className="grid gap-4">
        <Card className="">
          <CardHeader>
            <CardTitle>Current plans</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-3xl border border-border/60 bg-background/70 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">{plan.code}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${plan.isActive ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-500/15 text-slate-700 dark:text-slate-300"}`}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold">{formatCurrency(plan.amount.toNumber(), plan.currency)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every {plan.intervalCount} {plan.interval.toLowerCase().replace("_", " ")}
                </p>
                {Array.isArray(plan.features) && plan.features.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {plan.features.map((feature) => (
                      <li key={String(feature)}>{String(feature)}</li>
                    ))}
                  </ul>
                ) : null}
                <form action={deletePaymentPlanAction} className="mt-5">
                  <input type="hidden" name="id" value={plan.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
