import { listCopyrightFlaggedAction } from "@/lib/actions/copyright"
import { ResolveButtons } from "./resolve-buttons"

export const dynamic = "force-dynamic"

export default async function CopyrightReviewPage() {
  const items = await listCopyrightFlaggedAction()

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">Copyright review</h1>
      <p className="mt-1 text-sm text-white/60">
        Posts reported for copyright. Restore to make visible again, or remove to
        keep hidden.
      </p>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-white/50">Nothing awaiting review.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.thumbnailUrl || m.url}
                alt=""
                className="h-16 w-12 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {m.title || "Untitled post"}
                </p>
                <p className="truncate text-xs text-white/60">
                  {m.user.fullName}
                  {m.user.username ? ` @${m.user.username}` : ""}
                </p>
                <span className="mt-1 inline-block rounded-full bg-orange-500/20 px-2 py-0.5 text-[11px] font-semibold text-orange-300">
                  {m.copyrightStatus === "APPEALED" ? "Appealed" : "Under review"}
                </span>
              </div>
              <ResolveButtons mediaId={m.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
