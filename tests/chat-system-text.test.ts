import test from "node:test"
import assert from "node:assert/strict"
import { chatSystemText } from "../lib/chat-system-text"

test("privacy system tokens are never exposed in web chat previews", () => {
  assert.equal(chatSystemText("CHAT_HIDE_REQUEST:ACCEPTED"), "Hide request accepted.")
  assert.equal(chatSystemText("CHAT_UNHIDE_REQUEST:DECLINED"), "Unhide request declined.")
  assert.equal(chatSystemText("CHAT_HIDE_REQUEST:WITHDRAWN", true), "You withdrew the hide request.")
  assert.equal(chatSystemText("CHAT_HIDE_REQUEST:WITHDRAWN", false), "Hide request withdrawn.")
})

test("normal chat content is unchanged", () => {
  assert.equal(chatSystemText("hello"), "hello")
})
