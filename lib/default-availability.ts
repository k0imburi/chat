/** All-day recurring windows are timezone independent when every day is enabled. */
export function defaultAvailabilityWindows() {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday, startMinute: 0, endMinute: 1440, timezone: "UTC",
    voiceEnabled: true, videoEnabled: true,
  }))
}
export function defaultAvailabilitySlots() {
  return defaultAvailabilityWindows().flatMap(window =>
    Array.from({ length: 96 }, (_, index) => ({
      ...window, startMinute: index * 15, endMinute: (index + 1) * 15,
    })),
  )
}
