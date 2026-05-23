import { formatDistanceToNow, format } from "date-fns"

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—"
  return format(new Date(value), "dd MMM yyyy, HH:mm")
}

export function formatCurrency(
  amount: number | string,
  currency = "USD",
  locale = "en-US"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount || 0))
}

export function formatRelative(value: Date | string | null | undefined) {
  if (!value) return "—"
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

export function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
