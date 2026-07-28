import assert from "node:assert/strict"
import test from "node:test"
import { calculateWithdrawalValues } from "../lib/withdrawal-math"

test("5 percent fee reaches the USD 40 net threshold at USD 42.11 gross", () => {
  const quote = calculateWithdrawalValues(42.11, 5, 130)
  assert.equal(quote.feeUsd.toFixed(2), "2.11")
  assert.equal(quote.netUsd.toFixed(2), "40.00")
  assert.equal(quote.minimumShortfallUsd.toFixed(2), "0.00")
})

test("fees use half-up cent rounding and M-PESA uses whole-KES half-up rounding", () => {
  const quote = calculateWithdrawalValues(40.005, 2.5, 129.51)
  assert.equal(quote.grossUsd.toFixed(2), "40.01")
  assert.equal(quote.feeUsd.toFixed(2), "1.00")
  assert.equal(quote.netUsd.toFixed(2), "39.01")
  assert.equal(quote.netKes.toFixed(0), "5052")
  assert.equal(quote.minimumShortfallUsd.toFixed(2), "0.99")
})

test("zero fee preserves gross value", () => {
  const quote = calculateWithdrawalValues(40, 0, 130)
  assert.equal(quote.netUsd.toFixed(2), "40.00")
  assert.equal(quote.netKes.toFixed(0), "5200")
})
