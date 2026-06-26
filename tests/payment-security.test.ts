import assert from "node:assert/strict"
import test from "node:test"
import { validateSuccessfulStkPayment } from "../lib/mpesa-validation"

const expected = { amount: 220, phone: "254712345678" }

test("accepts exact STK callback payment facts", () => {
  assert.equal(validateSuccessfulStkPayment(expected, { amount: 220, phone: "254712345678", receipt: "TEST123" }), null)
})

test("rejects a missing receipt", () => {
  assert.match(validateSuccessfulStkPayment(expected, { amount: 220, phone: "254712345678", receipt: "" }) || "", /receipt/)
})

test("rejects underpayment and overpayment", () => {
  assert.match(validateSuccessfulStkPayment(expected, { amount: 219, phone: "254712345678", receipt: "A" }) || "", /amount/)
  assert.match(validateSuccessfulStkPayment(expected, { amount: 221, phone: "254712345678", receipt: "B" }) || "", /amount/)
})

test("rejects payment from a different phone", () => {
  assert.match(validateSuccessfulStkPayment(expected, { amount: 220, phone: "254700000000", receipt: "C" }) || "", /phone/)
})
