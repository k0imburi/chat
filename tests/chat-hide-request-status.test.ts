import assert from "node:assert/strict";
import test from "node:test";
import { chatHideRequestMessageText } from "../lib/chat-hide-request-status";

test("a withdrawn hide request stays withdrawn when messages are fetched", () => {
  assert.equal(
    chatHideRequestMessageText("CHAT_HIDE_REQUEST:WITHDRAWN", {
      action: "HIDE_FOR_ALL",
      status: "EXPIRED",
    }),
    "CHAT_HIDE_REQUEST:WITHDRAWN",
  );
});

test("an actually expired request is not reported as declined", () => {
  assert.equal(
    chatHideRequestMessageText("CHAT_HIDE_REQUEST:EXPIRED", {
      action: "HIDE_FOR_ALL",
      status: "EXPIRED",
    }),
    "CHAT_HIDE_REQUEST:EXPIRED",
  );
});

test("explicit decline and unhide statuses remain distinct", () => {
  assert.equal(
    chatHideRequestMessageText("CHAT_HIDE_REQUEST:PENDING", {
      action: "HIDE_FOR_ALL",
      status: "DECLINED",
    }),
    "CHAT_HIDE_REQUEST:DECLINED",
  );
  assert.equal(
    chatHideRequestMessageText("CHAT_UNHIDE_REQUEST:WITHDRAWN", {
      action: "UNHIDE_FOR_ALL",
      status: "EXPIRED",
    }),
    "CHAT_UNHIDE_REQUEST:WITHDRAWN",
  );
});
