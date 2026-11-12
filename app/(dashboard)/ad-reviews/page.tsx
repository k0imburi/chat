import { revalidatePath } from "next/cache"
import { AdTestControls } from "@/components/ad-test-controls"
import { AdBulkTestControl } from "@/components/ad-bulk-test-control"
import { requireSessionUser } from "@/lib/auth"
import { BadgeCheck, Megaphone, ShieldQuestion, TriangleAlert } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { reviewAdCampaignAction } from "@/lib/actions/ad-review"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const badge: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
}

export default async function AdReviewsPage() {
  const session = await requireSessionUser()
  const isAdmin = session.role === "ADMIN" || session.role === "SUPER_ADMIN"
  const [rows, approved] = await Promise.all([
    prisma.adCampaign.findMany({
      where: { reviewStatus: { in: ["PENDING", "REJECTED", "APPROVED"] } },
      orderBy: [{ reviewStatus: "asc" }, { createdAt: "desc" }],
      include: { owner: { select: { id: true, fullName: true, username: true, email: true } } },
    }),
    prisma.adCampaign.count({ where: { reviewStatus: "APPROVED" } }),
  ])
  const pending = rows.filter((row) => row.reviewStatus === "PENDING").length
  const rejected = rows.filter((row) => row.reviewStatus === "REJECTED").length

  return <div className="space-y-6">
    <PageHeader eyebrow="Verification" title="Ad reviews" description="Review first campaigns and policy-held promotions before they enter pacing and auction delivery." />
    {isAdmin ? <div className="flex justify-end"><AdBulkTestControl /></div> : null}
    <div className="grid gap-3 sm:grid-cols-3">
      <Summary label="Pending review" value={pending} icon={<ShieldQuestion className="h-5 w-5 text-amber-700" />} />
      <Summary label="Approved" value={approved} icon={<BadgeCheck className="h-5 w-5 text-emerald-700" />} />
      <Summary label="Needs attention" value={rejected} icon={<TriangleAlert className="h-5 w-5 text-rose-700" />} />
    </div>
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-4"><Megaphone className="h-5 w-5" /><h2 className="font-semibold">Promotion queue</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3">Advertiser</th><th className="px-5 py-3">Campaign</th><th className="px-5 py-3">Audience</th><th className="px-5 py-3">Budget</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Decision</th></tr></thead>
        <tbody className="divide-y">{rows.map((row) => <tr key={row.id} className="align-top hover:bg-muted/30">
          <td className="px-5 py-4"><p className="font-medium">{row.owner.fullName || "Unnamed account"}</p><p className="text-xs text-muted-foreground">@{row.owner.username || row.owner.id}</p></td>
          <td className="px-5 py-4"><p className="font-medium">{row.name}</p><p className="max-w-xs text-xs text-muted-foreground">{row.caption || "No caption"}</p>{row.websiteUrl ? <a className="text-xs text-emerald-700 underline" href={row.websiteUrl} target="_blank" rel="noreferrer">Open destination</a> : null}</td>
          <td className="px-5 py-4"><p>{(row.countries as string[]).join(", ")}</p><p className="max-w-xs text-xs text-muted-foreground">{(row.subjects as string[]).join(", ")}</p></td>
          <td className="px-5 py-4 tabular-nums">USD {(Number(row.budgetMicros) / 1e6).toFixed(2)}{row.isTest ? <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div><dt className="inline">Impressions: </dt><dd className="inline">{row.impressions.toLocaleString("en-KE")}</dd></div>
            <div><dt className="inline">Clicks: </dt><dd className="inline">{row.clicks.toLocaleString("en-KE")}</dd></div>
            <div><dt className="inline">Simulated spend: </dt><dd className="inline">USD {(Number(row.spentMicros) / 1e6).toFixed(2)}</dd></div>
            <div><dt className="inline">Started: </dt><dd className="inline">{formatDate(row.publishedAt || row.startDate)}</dd></div>
            <div><dt className="inline">Ends: </dt><dd className="inline">{formatDate(row.endDate)}</dd></div>
          </dl> : null}</td>
          <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge[row.reviewStatus]}`}>{row.reviewStatus}</span>{row.reviewReason ? <p className="mt-2 max-w-xs text-xs text-rose-700">{row.reviewReason}</p> : null}</td>
          <td className="px-5 py-4"><div className="grid min-w-[280px] justify-items-start gap-3">
            {row.isTest ? <div className="flex flex-wrap items-center gap-2"><span className="rounded-md border px-2 py-1 text-xs font-semibold">Test Ad</span><span className="text-xs text-muted-foreground">{row.status}</span></div> : row.reviewStatus === "PENDING" ? <div className="grid w-full gap-2"><form action={approve}><input type="hidden" name="campaignId" value={row.id} /><Button size="sm" type="submit">Approve</Button></form><form action={reject} className="space-y-2"><input type="hidden" name="campaignId" value={row.id} /><Textarea name="reason" placeholder="Reason shown to the advertiser" required /><Button size="sm" variant="destructive" type="submit">Reject</Button></form></div> : <span className="text-xs text-muted-foreground">Reviewed {formatDate(row.reviewedAt)}</span>}
            {isAdmin ? <AdTestControls campaignId={row.id} campaignName={row.name} isTest={row.isTest} active={row.status === "ACTIVE"} /> : null}
          </div></td>
        </tr>)}{!rows.length ? <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No promotions need review.</td></tr> : null}</tbody>
      </table></div>
    </div>
  </div>
}

async function approve(formData: FormData) {
  "use server"
  await requireNonTestCampaign(formData)
  await reviewAdCampaignAction({ campaignId: String(formData.get("campaignId") || ""), approved: true })
  revalidatePath("/ad-reviews")
}

async function reject(formData: FormData) {
  "use server"
  await requireNonTestCampaign(formData)
  await reviewAdCampaignAction({ campaignId: String(formData.get("campaignId") || ""), approved: false, reason: String(formData.get("reason") || "Promotion did not meet advertising policy.") })
  revalidatePath("/ad-reviews")
}

async function requireNonTestCampaign(formData: FormData) {
  await requireSessionUser()
  const campaign = await prisma.adCampaign.findUniqueOrThrow({ where: { id: String(formData.get("campaignId") || "") }, select: { isTest: true } })
  if (campaign.isTest) throw new Error("Test ads cannot use normal approval or rejection. Stop the test instead.")
}

function Summary({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p>{icon}</div><p className="mt-3 text-3xl font-bold tabular-nums">{value}</p></div>
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "—"
}
