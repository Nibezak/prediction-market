import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateTellwiseLocalDbSession } from '@/lib/db/queries/tellwise-local-user'
import {
  getTellwiseLocalSessionFromRequest,
  TELLWISE_LOCAL_SESSION_COOKIE,
} from '@/lib/tellwise-local-session'

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

  return handler.GET(req, ctx)
}

export async function POST(req: NextRequest, ctx: any) {
  const url = new URL(req.url)
  if (url.pathname.endsWith('/sign-out')) {
    const authResponse = await handler.POST(req, ctx)
    const response = new NextResponse(authResponse.body, {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers: authResponse.headers,
    })
    response.cookies.set(TELLWISE_LOCAL_SESSION_COOKIE, '', { path: '/', maxAge: 0 })
    response.cookies.set('mock_logged_in', '', { path: '/', maxAge: 0 })
    return response
  }

  return handler.POST(req, ctx)
}
