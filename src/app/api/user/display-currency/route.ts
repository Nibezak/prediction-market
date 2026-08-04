import { eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { users } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { enforceRateLimit } from '@/lib/security/rate-limit'

type DisplayCurrency = 'KES' | 'USD'

function normalizeCurrency(value: unknown): DisplayCurrency {
  return value === 'USD' ? 'USD' : 'KES'
}

async function getSessionUserId() {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders }).catch(() => null)
  return session?.user?.id ?? null
}

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ currency: 'KES' satisfies DisplayCurrency })
  }
  const [user] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1)
  const currency = normalizeCurrency((user?.settings as Record<string, any> | undefined)?.display?.currency)
  return NextResponse.json({ currency }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function PUT(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await enforceRateLimit({ scope: 'display-currency', identifier: userId, limit: 30, windowSeconds: 60 })
    const body = await request.json().catch(() => null) as { currency?: unknown } | null
    if (body?.currency !== 'KES' && body?.currency !== 'USD') {
      return NextResponse.json({ error: 'Unsupported currency.' }, { status: 400 })
    }
    const currency = body.currency
    const normalizedSettings = sql`
      CASE
        WHEN jsonb_typeof(COALESCE(${users.settings}, '{}'::jsonb)) = 'object'
          THEN COALESCE(${users.settings}, '{}'::jsonb)
        ELSE '{}'::jsonb
      END
    `
    const [updated] = await db.update(users).set({
      settings: sql`
        jsonb_set(
          ${normalizedSettings},
          '{display}',
          (
            CASE
              WHEN jsonb_typeof(${normalizedSettings}->'display') = 'object'
                THEN ${normalizedSettings}->'display'
              ELSE '{}'::jsonb
            END
            || jsonb_build_object('currency', ${currency}::text)
          ),
          true
        )
      `,
    }).where(eq(users.id, userId)).returning({ settings: users.settings })

    if (!updated) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }
    return NextResponse.json({ currency })
  }
  catch (error) {
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({
      error: status === 429 ? 'Too many preference changes. Please wait.' : 'Unable to save currency preference.',
    }, { status })
  }
}
