import { NextResponse } from 'next/server'
import { acceptProviderWebhook, verifyProviderWebhook } from '@/lib/payments/provider-webhook'

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await params
  const provider = rawProvider.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (!provider) return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 })
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 262_144) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 })
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > 262_144) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 })
  try {
    const timestamp = request.headers.get('x-provider-timestamp') || ''
    const signature = request.headers.get('x-provider-signature') || ''
    const verification = verifyProviderWebhook({ provider, rawBody, timestamp, signature })
    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const providerEventId = request.headers.get('x-provider-event-id') || (typeof payload.id === 'string' ? payload.id : '')
    if (!providerEventId) return NextResponse.json({ error: 'Provider event ID is required.' }, { status: 400 })
    const result = await acceptProviderWebhook(provider, providerEventId, payload, verification)
    return NextResponse.json({ ok: true, ...result })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook rejected.'
    const status = /signature|timestamp|verification/i.test(message) ? 401 : /JSON/i.test(message) ? 400 : 422
    return NextResponse.json({ error: message }, { status })
  }
}
