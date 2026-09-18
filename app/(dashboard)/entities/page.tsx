import { AccountType } from "@prisma/client"
import { Building2, CheckCircle2, Clock3, FileText, XCircle } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { reviewEntityDocumentsAction } from "@/lib/actions/entities"
import { prisma } from "@/lib/prisma"

const statusClass: Record<string, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-800",
  REJECTED: "bg-rose-50 text-rose-700",
  NOT_SUBMITTED: "bg-muted text-muted-foreground",
}

export default async function EntitiesPage() {
  const entities = await prisma.user.findMany({
    where: { accountType: AccountType.ENTITY },
    select: {
      id: true,
      fullName: true,
      username: true,
      country: true,
      officialEmail: true,
      entityDocuments: true,
      entityVerification: true,
      entityPublishedAt: true,
      entityPlanType: true,
      entityPlanExpiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const pending = entities.filter((entity) => entity.entityVerification === "PENDING").length
  const approved = entities.filter((entity) => entity.entityVerification === "APPROVED").length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Entity accounts"
        title="Entities"
        description="Review official documents and control which entity accounts are publicly verified."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="All entities" value={entities.length} icon={<Building2 className="h-5 w-5 text-sky-700" />} />
        <Summary label="Awaiting review" value={pending} icon={<Clock3 className="h-5 w-5 text-amber-700" />} />
        <Summary label="Verified & published" value={approved} icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Entity</th>
                <th className="px-5 py-3">Documents</th>
                <th className="px-5 py-3">Verification</th>
                <th className="px-5 py-3">Published</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entities.map((entity) => {
                const documents = documentEntries(entity.entityDocuments)
                const submitted = documents.length
                const status = entity.entityVerification
                return (
                  <tr key={entity.id} className="align-middle hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{entity.fullName}</p>
                      <p className="text-xs text-muted-foreground">@{entity.username || "unassigned"}{entity.country ? ` · ${entity.country}` : ""}</p>
                    </td>
                    <td className="px-5 py-4">
                      {submitted ? <DocumentLinks documents={documents} /> : <span className="text-muted-foreground">Not submitted</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[status]}`}>
                        {status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {entity.entityPublishedAt ? entity.entityPublishedAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "Not published"}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {entity.entityPlanType ? `${entity.entityPlanType.toLowerCase()}${entity.entityPlanExpiresAt ? " plan" : ""}` : "No plan"}
                    </td>
                    <td className="px-5 py-4">
                      {submitted && status !== "APPROVED" ? (
                        <div className="flex gap-2">
                          <form action={reviewEntityDocumentsAction}>
                            <input type="hidden" name="userId" value={entity.id} />
                            <input type="hidden" name="decision" value="APPROVE" />
                            <Button size="sm" type="submit">Approve documents</Button>
                          </form>
                          <form action={reviewEntityDocumentsAction}>
                            <input type="hidden" name="userId" value={entity.id} />
                            <input type="hidden" name="decision" value="REJECT" />
                            <Button size="sm" variant="outline" type="submit">Reject</Button>
                          </form>
                        </div>
                      ) : status === "APPROVED" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Live in app</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-4 w-4" /> Documents required</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!entities.length ? <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No entity accounts yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function documentEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const labels: Record<string, string> = {
    representativeId: "Representative ID",
    registration: "Registration",
    supporting: "Supporting document",
  }
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string" && item.trim())
    .map(([key, item]) => ({ label: labels[key] || key, objectKey: String(item) }))
}

function DocumentLinks({ documents }: { documents: Array<{ label: string; objectKey: string }> }) {
  return (
    <div className="flex flex-col gap-1">
      {documents.map((document) => (
        <a
          key={document.objectKey}
          href={`/api/admin/private-file?key=${encodeURIComponent(document.objectKey)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <FileText className="h-3.5 w-3.5" /> {document.label}
        </a>
      ))}
    </div>
  )
}

function Summary({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p>{icon}</div><p className="mt-3 text-3xl font-bold tabular-nums">{value}</p></div>
}
