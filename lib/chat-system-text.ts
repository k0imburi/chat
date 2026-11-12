export function chatSystemText(value: string, mine = false) {
  const match = value.match(/^CHAT_(HIDE|UNHIDE)_REQUEST:(PENDING|ACCEPTED|DECLINED|WITHDRAWN|EXPIRED)$/)
  if (!match) return value
  const action = match[1].toLowerCase()
  const status = match[2]
  if (status === "PENDING") return mine ? `You requested to ${action} this conversation.` : `${action === "hide" ? "Hide" : "Unhide"} request received.`
  if (status === "ACCEPTED") return `${action === "hide" ? "Hide" : "Unhide"} request accepted.`
  if (status === "DECLINED") return `${action === "hide" ? "Hide" : "Unhide"} request declined.`
  if (status === "WITHDRAWN") return mine ? `You withdrew the ${action} request.` : `${action === "hide" ? "Hide" : "Unhide"} request withdrawn.`
  return `${action === "hide" ? "Hide" : "Unhide"} request expired.`
}
