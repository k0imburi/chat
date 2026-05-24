/**
 * logError — writes a structured error line to stdout so PM2 captures it.
 *
 * Usage inside a catch block:
 *   logError("POST /api/mobile/auth/register", error)
 */
export function logError(label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? (error.stack ?? "") : ""
  // Single-line prefix so PM2 log tailing shows context immediately
  console.error(`[API Error] ${label}: ${message}`)
  if (stack) {
    // Print stack on next line — still captured by PM2 stderr
    console.error(stack)
  }
}
