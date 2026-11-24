import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
export async function GET() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { googleOAuthClientIds: true, appleOAuthAudiences: true } })
  const split = (value?: string | null) => (value || "").split(",").map(s => s.trim()).filter(Boolean)
  const google = split(settings?.googleOAuthClientIds || env.GOOGLE_OAUTH_CLIENT_IDS)
  const apple = split(settings?.appleOAuthAudiences || env.APPLE_OAUTH_AUDIENCES)
  return Response.json({ success: true, data: { googleWebClientId: google[0] || "", googleIosClientId: google[1] || "", appleServiceId: apple[0] || "" } }, { headers: { "Cache-Control": "no-store" } })
}
