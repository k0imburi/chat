import { test } from "node:test"
import assert from "node:assert/strict"
import { defaultAvailabilitySlots, defaultAvailabilityWindows } from "../lib/default-availability"

test("default availability covers every day without gaps for both call types", () => {
  const windows = defaultAvailabilityWindows(), slots = defaultAvailabilitySlots()
  assert.equal(windows.length, 7)
  assert.equal(slots.length, 7 * 96)
  for (let day = 0; day < 7; day++) {
    const daySlots = slots.filter(slot => slot.weekday === day)
    assert.equal(daySlots[0].startMinute, 0)
    assert.equal(daySlots.at(-1)?.endMinute, 1440)
    assert.ok(daySlots.every((slot, i) => slot.voiceEnabled && slot.videoEnabled && slot.endMinute - slot.startMinute === 15 && (i === 0 || daySlots[i - 1].endMinute === slot.startMinute)))
  }
})
