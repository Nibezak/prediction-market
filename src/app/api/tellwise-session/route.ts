import { NextResponse } from 'next/server'
import { getOrCreateTellwiseLocalDbSession } from '@/lib/db/queries/tellwise-local-user'
import {
  createTellwiseLocalSession,
  isTellwiseLocalSessionEnabled,
  TELLWISE_LOCAL_SESSION_COOKIE,
  TELLWISE_LOCAL_SESSION_VALUE,
} from '@/lib/tellwise-local-session'

function expireLocalCookies(response: NextResponse) {
  response.cookies.set(TELLWISE_LOCAL_SESSION_COOKIE, '', {
    path: '/',
    maxAge: 0,
  })
  response.cookies.set('mock_logged_in', '', {
    path: '/',
    maxAge: 0,
  })
}

export async function POST() {
  if (!isTellwiseLocalSessionEnabled()) {
    return NextResponse.json({ error: 'Tellwise local login is disabled.' }, { status: 404 })
  }

  const session = await getOrCreateTellwiseLocalDbSession()
  const response = NextResponse.json(session, { status: 200 })
  response.cookies.set('mock_logged_in', '', {
    path: '/',
    maxAge: 0,
  })
  response.cookies.set(TELLWISE_LOCAL_SESSION_COOKIE, TELLWISE_LOCAL_SESSION_VALUE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
  })

  return response
}

export async function GET() {
  if (!isTellwiseLocalSessionEnabled()) {
    return NextResponse.json(null, { status: 404 })
  }

  return NextResponse.json(createTellwiseLocalSession(), { status: 200 })
}

export async function DELETE() {
  const response = NextResponse.json({ success: true }, { status: 200 })
  expireLocalCookies(response)
  return response
}
