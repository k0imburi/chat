import { Archive, HardDrive, Link2, Unlink } from "lucide-react"
import { AssetsTable } from "@/components/assets-table"
import { PageHeader } from "@/components/page-header"
import { getAssetsAdmin } from "@/lib/ops-queries"

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
  icon: typeof Archive
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

function formatStorage(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export default async function AssetsPage() {
  const data = await getAssetsAdmin({})

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Storage"
        title="Asset storage"
        description="Review uploaded R2 objects, identify linked media, and safely remove orphaned files."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Assets" value={data.summary.totalAssets.toLocaleString()} hint="Tracked R2 objects in the platform" icon={Archive} gradient="from-violet-600 to-indigo-600" />
        <SummaryCard title="Storage used" value={formatStorage(data.summary.totalBytes)} hint="Total stored object size" icon={HardDrive} gradient="from-sky-600 to-cyan-600" />
        <SummaryCard title="Linked assets" value={data.summary.linkedAssets.toLocaleString()} hint="Referenced by user media records" icon={Link2} gradient="from-emerald-600 to-teal-600" />
        <SummaryCard title="Orphaned assets" value={data.summary.orphanAssets.toLocaleString()} hint="Safe candidates for cleanup" icon={Unlink} gradient="from-amber-500 to-orange-500" />
      </div>

      <AssetsTable initialData={data} />
    </div>
  )
}
