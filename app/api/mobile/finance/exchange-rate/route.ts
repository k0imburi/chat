import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

let _cached: { rate: number; ts: number } | null = null
const CACHE_MS = 60 * 60 * 1000 // 1 hour

export async function GET() {
  // Return cached rate if fresh
  if (_cached && Date.now() - _cached.ts < CACHE_MS) {
    return NextResponse.json({ rate: _cached.rate, source: 'cached' })
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const data = await res.json()
      const rate = data?.rates?.KES as number | undefined
      if (rate && rate > 0) {
        _cached = { rate, ts: Date.now() }
        return NextResponse.json({ rate, source: 'live' })
      }
    }
  } catch {
    // fall through to DB fallback
  }

  // Fallback: AppSettings.usdToKesRate, else a sane default. Note usdToKesRate
  // DEFAULTS to 0, and `0 ?? 130` is 0 — so guard on > 0 or the app would show
  // no KES estimate at withdrawal.
  try {
    const settings = await prisma.appSettings.findFirst()
    const fallback = Number((settings as Record<string, unknown>)?.usdToKesRate ?? 0)
    const rate = fallback > 0 ? fallback : 130
    return NextResponse.json({ rate, source: 'fallback' })
  } catch {
    return NextResponse.json({ rate: 130, source: 'fallback' })
  }
}
