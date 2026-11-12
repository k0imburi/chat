import assert from "node:assert/strict"
import test from "node:test"
import { isAgentTyping, supportMessageSchema, supportTicketLabel, SUPPORT_TYPING_TTL_MS } from "../lib/support-contract"

test("support requests trim messages and preserve optional followup IDs", () => {
  assert.deepEqual(supportMessageSchema.parse({ message: " Hello " }), { message: "Hello" })
  assert.deepEqual(supportMessageSchema.parse({ message: " Followup ", ticketId: "ticket1" }), { message: "Followup", ticketId: "ticket1" })
  for (const input of [{ message: " " }, { message: "a".repeat(5001) }, { message: "Hello", ticketId: "" }, { ticketId: "ticket1" }]) {
    assert.equal(supportMessageSchema.safeParse(input).success, false)
  }
})

test("typing expires exactly at TTL and supports multiple agents", () => {
  const now = new Date(10000)
  assert.equal(isAgentTyping([], now), false)
  assert.equal(isAgentTyping([{ expiresAt: now }], now), false)
  assert.equal(isAgentTyping([{ expiresAt: new Date(9999) }], now), false)
  assert.equal(isAgentTyping([{ expiresAt: now }, { expiresAt: new Date(now.getTime() + SUPPORT_TYPING_TTL_MS) }], now), true)
})

test("ticket labels preserve legacy numbers and do not truncate new ones", () => {
  assert.equal(supportTicketLabel({ ticketNumber: null, subject: "Support chat · C#123" }), "C#123")
  assert.equal(supportTicketLabel({ ticketNumber: 1, subject: "" }), "C#001")
  assert.equal(supportTicketLabel({ ticketNumber: 10001, subject: "" }), "C#10001")
})
