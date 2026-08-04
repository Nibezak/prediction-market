import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { users } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { getClientNetworkIdentity } from '@/lib/security/client-identity'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { verifyWithdrawalPhonePin } from '@/lib/withdrawal-phone-pin'

export async function POST(request: Request) {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders }).catch(() => null)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = getClientNetworkIdentity(request.headers)
    await Promise.all([
      enforceRateLimit({ scope: 'withdrawal-passcode-user', identifier: session.user.id, limit: 5, windowSeconds: 300 }),
      enforceRateLimit({ scope: 'withdrawal-passcode-ip', identifier: client.ip, limit: 12, windowSeconds: 300 }),
    ])

    const body = await request.json().catch(() => null) as { passcode?: unknown } | null
    const [security] = await db.select({ pinHash: users.withdrawal_phone_pin_hash })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)

    if (!security?.pinHash) {
      return NextResponse.json({ error: 'Set your withdrawal passcode first.' }, { status: 428 })
    }
    const matches = await verifyWithdrawalPhonePin(String(body?.passcode ?? ''), security.pinHash)
    if (!matches) {
      return NextResponse.json({ error: 'Incorrect passcode.' }, { status: 403 })
    }
    return NextResponse.json({ verified: true })
  }
  catch (error) {
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({
      error: status === 429 ? 'Too many attempts. Please wait and try again.' : 'Unable to verify passcode.',
    }, { status })
  }
}
