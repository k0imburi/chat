import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type DataTableColumn<T> = {
  key: string
  header: ReactNode
  accessorKey?: keyof T | string
  headerClassName?: string
  cellClassName?: string
  render?: (row: T) => ReactNode
}

export function DataTable<T>({
  title,
  description,
  actions,
  columns,
  rows,
  emptyTitle = "No records found",
  emptyDescription = "There is nothing to display yet.",
  footer,
  toolbar,
  footerStart,
  footerEnd,
  tableWrapperClassName,
  getRowKey,
  onRowClick,
  getRowClassName,
  showRowNumbers = false,
  rowNumberOffset = 0,
  loading = false,
  bare = false,
}: {
  title?: string
  description?: string
  /** Buttons/links rendered in the CardHeader right side */
  actions?: ReactNode
  columns: DataTableColumn<T>[]
  rows: T[]
  emptyTitle?: string
  emptyDescription?: string
  footer?: ReactNode
  /** Filter bar rendered between CardHeader and the table */
  toolbar?: ReactNode
  footerStart?: ReactNode
  footerEnd?: ReactNode
  tableWrapperClassName?: string
  getRowKey?: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  getRowClassName?: (row: T) => string
  showRowNumbers?: boolean
  rowNumberOffset?: number
  /** Show skeleton rows instead of data while fetching */
  loading?: boolean
  /** Render without Card wrapper (legacy / special cases) */
  bare?: boolean
}) {
  const clickable = typeof onRowClick === "function"
  const resolvedFooterEnd = footerEnd ?? footer
  const hasHeader = Boolean(title || description || actions)
  const hasToolbar = Boolean(toolbar)
  const hasFooter = Boolean(footerStart || resolvedFooterEnd)

  const tableEl = (
    <div className={cn("overflow-x-auto", tableWrapperClassName)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40 border-border/60">
            {showRowNumbers && (
              <TableHead className="h-10 w-12 px-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </TableHead>
            )}
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "h-10 px-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  column.headerClassName,
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: rows.length || 8 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="border-border/50">
                {showRowNumbers && (
                  <TableCell className="px-5 py-3.5">
                    <Skeleton className="h-4 w-6" />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell key={column.key} className={cn("px-5 py-3.5", column.cellClassName)}>
                    <Skeleton className="h-4 w-3/4 max-w-[180px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length > 0 ? (
            rows.map((row, index) => (
              <TableRow
                key={getRowKey ? getRowKey(row, index) : String(index)}
                className={cn(
                  "border-border/50 transition-colors hover:bg-muted/25",
                  clickable ? "cursor-pointer" : "",
                  getRowClassName?.(row),
                )}
                {...(clickable ? { onClick: () => onRowClick(row) } : {})}
              >
                {showRowNumbers && (
                  <TableCell className="px-5 py-3.5 align-middle tabular-nums text-sm text-muted-foreground">
                    {rowNumberOffset + index + 1}
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell key={column.key} className={cn("px-5 py-3.5 align-middle text-sm", column.cellClassName)}>
                    {column.render
                      ? column.render(row)
                      : column.accessorKey
                        ? String((row as Record<string, unknown>)[String(column.accessorKey)] ?? "—")
                        : "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length + (showRowNumbers ? 1 : 0)}
                className="px-6 py-16 text-center"
              >
                <p className="font-medium text-foreground">{emptyTitle}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{emptyDescription}</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )

  const footerEl = hasFooter ? (
    <div className="flex flex-col gap-3 border-t border-border/60 px-5 py-3.5 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-muted-foreground">{footerStart}</div>
      <div className="flex flex-wrap items-center gap-3 md:justify-end">{resolvedFooterEnd}</div>
    </div>
  ) : null

  if (bare) {
    return (
      <div className="space-y-4">
        {tableEl}
        {footerEl}
      </div>
    )
  }

  return (
    <Card className="overflow-hidden">
      {hasHeader && (
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border/60">
          {(title || description) && (
            <div className="min-w-0 space-y-0.5">
              {title && <CardTitle>{title}</CardTitle>}
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          )}
          {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
        </CardHeader>
      )}

      {hasToolbar && (
        <div className="border-b border-border/60 px-5 py-3.5">
          {toolbar}
        </div>
      )}

      <CardContent className="p-0">
        {tableEl}
      </CardContent>

      {footerEl}
    </Card>
  )
}
