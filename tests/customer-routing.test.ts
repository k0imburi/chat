import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"
import { middleware } from "../middleware"

function customerRequest(path: string) {
  return new NextRequest(`https://www.chatandtip.com${path}`, {
    headers: { host: "www.chatandtip.com" },
  })
}

test("the realtime upgrade path bypasses the Flutter rewrite", async () => {
  const response = await middleware(customerRequest("/ws/mobile?token=fixture"))
  assert.equal(response.headers.get("x-middleware-next"), "1")
  assert.equal(response.headers.get("x-middleware-rewrite"), null)
})

test("customer Wallet URLs are unavailable and the normal web shell is still served", async () => {
  for (const path of ["/wallet", "/wallet/history"]) {
    const response = await middleware(customerRequest(path))
    assert.equal(response.status, 404)
    assert.equal(response.headers.get("x-middleware-rewrite"), null)
  }
  const home = await middleware(customerRequest("/"))
  assert.equal(home.headers.get("x-middleware-rewrite"), "https://www.chatandtip.com/flutter/index.html")
  const checkout = await middleware(customerRequest("/checkout"))
  assert.equal(checkout.headers.get("x-middleware-next"), "1")
})
