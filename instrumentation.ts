/**
 * Next.js Instrumentation
 * Runs once when the server boots. `onRequestError` is called for every
 * unhandled error in route handlers, middleware, server actions, and rendering.
 * These will appear as [API Error] lines in PM2 / stdout logs.
 */

export function register() {
  // Hook is registered by exporting `onRequestError` below
}

export async function onRequestError(
  error: Error & { digest?: string },
  request: {
    path: string
    method: string
    headers: Record<string, string>
  },
  context: {
    routerKind: string
    routePath: string
    routeType: string
  },
) {
  // Skip Next.js internal not-found / redirect non-errors
  if ("NEXT_NOT_FOUND" === (error as any).code) return
  if ("NEXT_REDIRECT" === (error as any).code) return

  console.error(
    `[API Error] ${request.method} ${request.path} | route: ${context.routePath} (${context.routeType}) |`,
    error.message,
    "\n",
    error.stack ?? "",
  )
}
