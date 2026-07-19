import type { NextRequest } from 'next/server'
import { toNextJsHandler } from 'better-auth/next-js'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { getOrCreateTellwiseLocalDbSession } from '@/lib/db/queries/tellwise-local-user'
import {
  getTellwiseLocalSessionFromRequest,
  TELLWISE_LOCAL_SESSION_COOKIE,
} from '@/lib/tellwise-local-session'
import { enforceRateLimit } from '@/lib/security/rate-limit'

const handler = toNextJsHandler(auth.handler)

export async function GET(req: NextRequest, ctx: any) {
  const url = new URL(req.url)
  if (url.pathname.endsWith('/get-session') || url.pathname.endsWith('/session')) {
    const localSession = getTellwiseLocalSessionFromRequest(req)
    if (localSession) {
      try {
        return NextResponse.json(await getOrCreateTellwiseLocalDbSession())
      }
      catch {
        return NextResponse.json(localSession)
      }
    }
  }

  return handler.GET(req)
}

export async function POST(req: NextRequest, ctx: any) {
  const url = new URL(req.url)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  const isSignup = url.pathname.includes('/sign-up/')
  try {
    await enforceRateLimit({ scope: isSignup ? 'auth-signup' : 'auth-request', identifier: ip, limit: isSignup ? 5 : 30, windowSeconds: isSignup ? 3600 : 60 })
  }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Too many authentication attempts' }, { status: 429, headers: { 'retry-after': String((error as any)?.retryAfter || 60) } })
  }
  const contentLength = Number(req.headers.get('content-length') || '0')
  if (contentLength > 64 * 1024) return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
  if (url.pathname.endsWith('/sign-out')) {
    const session = await auth.api.getSession({ headers: req.headers }).catch(() => null)
    const authResponse = await handler.POST(req)
    const response = new NextResponse(authResponse.body, {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers: authResponse.headers,
    })
    response.cookies.set(TELLWISE_LOCAL_SESSION_COOKIE, '', { path: '/', maxAge: 0 })
    response.cookies.set('mock_logged_in', '', { path: '/', maxAge: 0 })
    await recordAuditEvent({
      eventType: 'auth.logout', category: 'authentication', action: 'User signed out',
      actorUserId: session?.user?.id, subjectUserId: session?.user?.id,
      outcome: authResponse.ok ? 'success' : 'failure', ...requestAuditContext(req.headers),
    })
    return response
  }

  const authResponse = await handler.POST(req)
  if (url.pathname.includes('/sign-in/')) {
    const payload = await authResponse.clone().json().catch(() => null)
    const succeeded = authResponse.ok && Boolean(payload?.user)
    await recordAuditEvent({
      eventType: succeeded ? 'auth.login.succeeded' : 'auth.login.failed',
      category: 'authentication', action: succeeded ? 'User signed in' : 'Sign-in attempt failed',
      outcome: succeeded ? 'success' : 'failure', severity: succeeded ? 'info' : 'warning',
      actorUserId: payload?.user?.id, subjectUserId: payload?.user?.id,
      metadata: { provider: url.pathname.split('/').at(-1), status: authResponse.status },
      ...requestAuditContext(req.headers),
    })
  }
  if (url.pathname.includes('/sign-up/')) {
    const payload = await authResponse.clone().json().catch(() => null)
    const succeeded = authResponse.ok && Boolean(payload?.user)
    await recordAuditEvent({
      eventType: succeeded ? 'auth.signup.succeeded' : 'auth.signup.failed',
      category: 'authentication', action: succeeded ? 'User account created' : 'Sign-up attempt failed',
      outcome: succeeded ? 'success' : 'failure', severity: succeeded ? 'info' : 'warning',
      actorUserId: payload?.user?.id, subjectUserId: payload?.user?.id,
      metadata: { provider: url.pathname.split('/').at(-1), status: authResponse.status },
      ...requestAuditContext(req.headers),
    })
  }
  return authResponse
}
