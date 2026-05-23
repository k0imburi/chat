import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

function pageUrl(basePath: string, params: URLSearchParams, p: number) {
  const sp = new URLSearchParams(params)
  sp.set("page", String(p))
  return `${basePath}?${sp.toString()}`
}

export function PaginationControls({
  basePath,
  page,
  totalPages,
  params,
}: {
  basePath: string
  page: number
  totalPages: number
  params: URLSearchParams
}) {
  const maxVisible = 5
  let start = Math.max(1, page - Math.floor(maxVisible / 2))
  let end = start + maxVisible - 1
  if (end > totalPages) {
    end = totalPages
    start = Math.max(1, end - maxVisible + 1)
  }
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const isFirst = page <= 1
  const isLast = page >= totalPages

  const navBase =
    "flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium transition-colors"

  return (
    <div className="flex items-center gap-1.5">
      {isFirst ? (
        <span className={cn(navBase, "cursor-not-allowed select-none text-muted-foreground opacity-50")}>
          <ChevronLeft className="h-4 w-4" />
          Prev
        </span>
      ) : (
        <Link href={pageUrl(basePath, params, page - 1)} className={cn(navBase, "hover:bg-muted/40")}>
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Link>
      )}

      {pages.map((p) => (
        <Link
          key={p}
          href={pageUrl(basePath, params, p)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
            p === page
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border hover:bg-muted/40",
          )}
        >
          {p}
        </Link>
      ))}

      {isLast ? (
        <span className={cn(navBase, "cursor-not-allowed select-none text-muted-foreground opacity-50")}>
          Next
          <ChevronRight className="h-4 w-4" />
        </span>
      ) : (
        <Link href={pageUrl(basePath, params, page + 1)} className={cn(navBase, "hover:bg-muted/40")}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}
