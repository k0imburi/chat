export type ExpectedStkPayment = {
  amount: number
  phone: string | null
}

export type ReceivedStkPayment = {
  amount: number
  phone: string
  receipt: string
}

export function validateSuccessfulStkPayment(expected: ExpectedStkPayment, received: ReceivedStkPayment) {
  if (!received.receipt.trim()) return "Successful callback is missing an M-PESA receipt"
  if (!Number.isFinite(received.amount) || expected.amount !== received.amount) return "Callback amount does not match expected amount"
  if (!expected.phone || expected.phone !== received.phone) return "Callback phone does not match expected phone"
  return null
}
