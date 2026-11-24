/** Apple POSTs here only for Android's browser sign-in flow. */
export async function POST(request: Request) {
  const form = await request.formData()
  const params = new URLSearchParams()
  for (const key of ["code", "id_token", "state", "user", "error"]) {
    const value = form.get(key)
    if (typeof value === "string" && value.length <= 16384) params.set(key, value)
  }
  return new Response(null, { status: 303, headers: { Location: `intent://callback?${params.toString()}#Intent;package=com.chatandtip.app;scheme=signinwithapple;end`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
}
