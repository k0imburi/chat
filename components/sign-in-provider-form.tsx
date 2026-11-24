'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignInProviderForm({ google, apple }: { google: string; apple: string }) {
  const [googleIds, setGoogleIds] = useState(google)
  const [appleIds, setAppleIds] = useState(apple)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFeedback('')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch('/api/admin/sign-in-providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleOAuthClientIds: googleIds, appleOAuthAudiences: appleIds }), signal: controller.signal })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.message || 'Could not save provider IDs. Please try again.')
      setFeedback(result.message || 'Sign-in provider identifiers saved.')
      toast.success(result.message || 'Sign-in provider identifiers saved.')
    } catch (error) {
      const message = controller.signal.aborted ? 'The request timed out. Reload this page to check whether the IDs were saved before trying again.' : error instanceof Error ? error.message : 'Could not save provider IDs. Please try again.'
      setFeedback(message)
      toast.error(message)
    } finally {
      clearTimeout(timeout)
      setSaving(false)
    }
  }
  return <form onSubmit={save} className="grid gap-4">
    <div className="space-y-2"><Label htmlFor="googleOAuthClientIds">Google OAuth client IDs (comma-separated)</Label><Input id="googleOAuthClientIds" name="googleOAuthClientIds" value={googleIds} onChange={e => setGoogleIds(e.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="appleOAuthAudiences">Apple Services and app IDs (comma-separated)</Label><Input id="appleOAuthAudiences" name="appleOAuthAudiences" value={appleIds} onChange={e => setAppleIds(e.target.value)} /></div>
    <p className="text-sm text-muted-foreground">Put the Google web client ID and Apple Services ID first; include native app IDs after them. Leaving a field empty uses the server environment setting. Configure the authorized origins and Apple callback in the provider consoles before enabling sign-in.</p>
    <div><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save provider IDs'}</Button></div>
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
  </form>
}
