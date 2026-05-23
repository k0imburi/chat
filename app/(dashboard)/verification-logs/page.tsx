import { Clock3, KeyRound, ShieldCheck, ShieldOff } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { VerificationLogsTable } from "@/components/verification-logs-table"
import { getVerificationLogsAdmin } from "@/lib/ops-queries"

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  gradient,
}: {
  title: string
  value: string
  hint: string
  icon: typeof KeyRound
  gradient: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${gradient} p-5 text-white`}>
      <div className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-5 right-1 h-20 w-20 rounded-full bg-white/5" />
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-white/75">{title}</p>
        <Icon className="h-4 w-4 text-white/60" />
      </div>
      <p className="relative mt-3 text-4xl font-bold tabular-nums">{value}</p>
      <p className="relative mt-2 text-[11px] text-white/60">{hint}</p>
    </div>
  )
}

export default async function VerificationLogsPage() {
  const data = await getVerificationLogsAdmin({})

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security"
        title="Verification logs"
        description="Track OTP and password reset codes, watch active tokens, and revoke codes that should no longer be used."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total logs" value={data.summary.total.toLocaleString()} hint="All stored verification records" icon={KeyRound} gradient="from-violet-600 to-indigo-600" />
        <SummaryCard title="Active" value={data.summary.active.toLocaleString()} hint="Unconsumed and not expired" icon={Clock3} gradient="from-amber-500 to-orange-500" />
        <SummaryCard title="Consumed" value={data.summary.consumed.toLocaleString()} hint="Successfully closed verification events" icon={ShieldCheck} gradient="from-emerald-600 to-teal-600" />
        <SummaryCard title="Expired" value={data.summary.expired.toLocaleString()} hint="Expired before use" icon={ShieldOff} gradient="from-slate-600 to-slate-800" />
      </div>

      <VerificationLogsTable initialData={data} />
    </div>
  )
}
