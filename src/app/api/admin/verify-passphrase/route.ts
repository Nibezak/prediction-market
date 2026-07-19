import { NextResponse } from 'next/server'
import {
  ADMIN_VERIFICATION_COOKIE_NAME,
  createAdminVerificationCookieValue,
  getAdminVerificationCookieMaxAge,
  isAdminEmail,
  verifyAdminPassphrase,
} from '@/lib/admin'
import { UserRepository } from '@/lib/db/queries/user'

export async function POST(request: Request) {
  const currentUser = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!currentUser || !currentUser.is_admin || !isAdminEmail(currentUser.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { passphrase?: unknown } | null
  const passphrase = typeof body?.passphrase === 'string' ? body.passphrase : ''
  if (!verifyAdminPassphrase(passphrase)) {
    return NextResponse.json({ error: 'Invalid passphrase' }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  const cookieValue = createAdminVerificationCookieValue(currentUser.id)
  if (!cookieValue) {
    return NextResponse.json({ error: 'Admin verification is not configured.' }, { status: 500 })
  }
  response.cookies.set(ADMIN_VERIFICATION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getAdminVerificationCookieMaxAge(),
  })
  return response
}
