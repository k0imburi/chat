export function parseSignInProviderSettings(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings request.')
  const value = input as Record<string, unknown>
  if (typeof value.googleOAuthClientIds !== 'string' || typeof value.appleOAuthAudiences !== 'string') throw new Error('Provider IDs must be text.')
  const google = value.googleOAuthClientIds.trim()
  const apple = value.appleOAuthAudiences.trim()
  const split = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean)
  if (google.length > 4000 || split(google).some(x => !/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(x))) throw new Error('Enter valid Google OAuth client IDs separated by commas.')
  if (apple.length > 4000 || split(apple).some(x => !/^[A-Za-z0-9.-]+$/.test(x))) throw new Error('Enter valid Apple Services or app IDs separated by commas.')
  return { googleOAuthClientIds: google || null, appleOAuthAudiences: apple || null }
}
