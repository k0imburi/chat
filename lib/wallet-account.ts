export function formatWalletAccountId(userId: string) {
  const normalized = userId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  return `WAL-${normalized.slice(-10).padStart(10, "0")}`
}

export function getSignedWalletAmount(type: string, amount: number) {
  return type.toLowerCase() === "debit" ? -Math.abs(amount) : Math.abs(amount)
}
