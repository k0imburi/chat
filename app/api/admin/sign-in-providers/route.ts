import { UserRole } from '@prisma/client'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseSignInProviderSettings } from '@/lib/sign-in-provider-settings'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  try {
    if (!origin || !host || new URL(origin).host !== host) return Response.json({ message: 'Invalid request origin.' }, { status: 403 })
  } catch {
    return Response.json({ message: 'Invalid request origin.' }, { status: 403 })
  }
  const user = await getSessionUser()
  if (!user) return Response.json({ message: 'Please sign in again.' }, { status: 401 })
  if (user.role !== UserRole.SUPER_ADMIN) return Response.json({ message: 'Only a super administrator can change sign-in providers.' }, { status: 403 })
  let values: ReturnType<typeof parseSignInProviderSettings>
  try {
    values = parseSignInProviderSettings(await request.json())
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : 'Invalid settings request.' }, { status: 400 })
  }
  try {
    const existing = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { googleOAuthClientIds: true, appleOAuthAudiences: true } })
    if (existing && existing.googleOAuthClientIds === values.googleOAuthClientIds && existing.appleOAuthAudiences === values.appleOAuthAudiences) {
      return Response.json({ message: 'Provider IDs are already up to date.', unchanged: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    await prisma.appSettings.upsert({ where: { id: 1 }, update: values, create: { id: 1, ...values } })
    return Response.json({ message: 'Sign-in provider identifiers saved.' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Unable to save sign-in provider identifiers', error)
    return Response.json({ message: 'Could not save provider IDs. Please try again.' }, { status: 500 })
  }
}
