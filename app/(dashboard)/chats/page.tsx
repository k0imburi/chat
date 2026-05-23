import { Camera, Eye, MessageSquareMore, MessagesSquare } from "lucide-react"
import { ChatsTable } from "@/components/chats-table"
import { PageHeader } from "@/components/page-header"
import { getChatThreadsAdmin } from "@/lib/ops-queries"

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
  icon: typeof MessagesSquare
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

export default async function ChatsPage() {
  const data = await getChatThreadsAdmin({})

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oversight"
        title="Chat threads"
        description="Review message activity, unread volume, and participant conversations from the mobile app."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Active threads"
          value={data.summary.activeThreads.toLocaleString()}
          hint="Conversation threads with at least one message"
          icon={MessageSquareMore}
          gradient="from-violet-600 to-indigo-600"
        />
        <SummaryCard
          title="Total messages"
          value={data.summary.totalMessages.toLocaleString()}
          hint="All stored thread messages"
          icon={MessagesSquare}
          gradient="from-sky-600 to-cyan-600"
        />
        <SummaryCard
          title="Unread entries"
          value={data.summary.unreadMessages.toLocaleString()}
          hint="Unread counts aggregated across participants"
          icon={Eye}
          gradient="from-amber-500 to-orange-500"
        />
        <SummaryCard
          title="Media messages"
          value={data.summary.imageMessages.toLocaleString()}
          hint="Image-based chat messages"
          icon={Camera}
          gradient="from-emerald-600 to-teal-600"
        />
      </div>

      <ChatsTable initialData={data} />
    </div>
  )
}
