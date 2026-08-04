import { randomUUID } from 'node:crypto'
import { createAuthEndpoint } from '@better-auth/core/api'
import { setSessionCookie } from 'better-auth/cookies'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { accounts, users } from '@/lib/db/schema/auth/tables'
import { db } from '@/lib/drizzle'
import { verifyFirebaseIdToken } from '@/lib/firebase/server'
import { verifyUserTotp } from '@/lib/two-factor-service'

const FIREBASE_2FA_CHALLENGE_COOKIE = 'slimefish.firebase_2fa_challenge'
const CHALLENGE_MAX_AGE_SECONDS = 5 * 60

function getInitialDisplayName(email: string) {
  const localPart = email.split('@')[0]?.trim()
  return localPart || 'Slimefish user'
}

function shouldUseSecureCookies() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || '').startsWith('https://')
}

async function findOrCreateFirebaseUser(ctx: any, idToken: string) {
  const identity = await verifyFirebaseIdToken(idToken)
  if (identity.provider === 'password' && !identity.emailVerified) {
    throw ctx.error('UNAUTHORIZED', { message: 'Verify your email before signing in.' })
  }
  const linkedRows = await db
    .select({ id: users.id, image: users.image })
    .from(accounts)
    .innerJoin(users, eq(accounts.user_id, users.id))
    .where(and(eq(accounts.provider_id, 'firebase'), eq(accounts.account_id, identity.uid)))
    .limit(1)
  const emailRows = linkedRows.length > 0
    ? []
    : await db
        .select({ id: users.id, image: users.image })
        .from(users)
        .where(eq(users.email, identity.email))
        .limit(1)

  const existingRows = linkedRows.length > 0 ? linkedRows : emailRows
  let userId = existingRows[0]?.id
  if (!userId) {
    const createdUser = await ctx.context.internalAdapter.createUser({
      id: randomUUID().replaceAll('-', '').slice(0, 26),
      email: identity.email,
      emailVerified: identity.emailVerified,
      name: getInitialDisplayName(identity.email),
      // Provider profile photos are identity-provider data, not public profile data.
      // Users opt in to a public avatar through Slimefish's profile settings.
      image: null,
      address: `firebase:${identity.uid}`,
    })
    if (!createdUser) {
      throw ctx.error('BAD_REQUEST', { message: 'Failed to create the application user.' })
    }
    userId = createdUser.id
  }
  else {
    const existingImage = existingRows[0]?.image?.trim() ?? ''
    const providerImage = existingImage
      && (() => {
        try {
          const hostname = new URL(existingImage).hostname.toLowerCase()
          return hostname === 'googleusercontent.com'
            || hostname.endsWith('.googleusercontent.com')
            || hostname.endsWith('.ggpht.com')
        }
        catch {
          return false
        }
      })()

    await db
      .update(users)
      .set({
        email_verified: identity.emailVerified,
        ...(providerImage ? { image: null } : {}),
      })
      .where(eq(users.id, userId))
  }

  if (linkedRows.length === 0) {
    await ctx.context.internalAdapter.linkAccount({ userId, providerId: 'firebase', accountId: identity.uid })
  }

  const user = await ctx.context.internalAdapter.findUserById(userId)
  if (!user) {
    throw ctx.error('UNAUTHORIZED', { message: 'Application user could not be loaded.' })
  }
  return user
}

async function issueSession(ctx: any, user: any) {
  const session = await ctx.context.internalAdapter.createSession(user.id, false)
  if (!session) {
    throw ctx.error('UNAUTHORIZED', { message: 'Failed to create a secure session.' })
  }
  await setSessionCookie(ctx, { session, user }, false)
  return session
}

export function firebaseAuthPlugin() {
  return {
    id: 'firebase-auth',
    endpoints: {
      firebaseSignIn: createAuthEndpoint('/firebase/sign-in', {
        method: 'POST',
        body: z.object({ idToken: z.string().min(100) }),
      }, async (ctx) => {
        const user = await findOrCreateFirebaseUser(ctx, ctx.body.idToken)
        const userRow = await db
          .select({ twoFactorEnabled: users.two_factor_enabled })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)

        if (userRow[0]?.twoFactorEnabled) {
          await ctx.setSignedCookie(
            FIREBASE_2FA_CHALLENGE_COOKIE,
            user.id,
            ctx.context.secret,
            {
              httpOnly: true,
              sameSite: 'lax',
              secure: shouldUseSecureCookies(),
              path: '/',
              maxAge: CHALLENGE_MAX_AGE_SECONDS,
            },
          )
          return ctx.json({ requiresTwoFactor: true })
        }

        const session = await issueSession(ctx, user)
        return ctx.json({ requiresTwoFactor: false, token: session.token })
      }),
      firebaseVerifyTwoFactor: createAuthEndpoint('/firebase/verify-two-factor', {
        method: 'POST',
        body: z.object({ code: z.string().regex(/^\d{6}$/) }),
      }, async (ctx) => {
        const userId = await ctx.getSignedCookie(FIREBASE_2FA_CHALLENGE_COOKIE, ctx.context.secret)
        if (!userId) {
          throw ctx.error('UNAUTHORIZED', { message: 'The 2FA challenge has expired. Sign in again.' })
        }

        if (!await verifyUserTotp(userId, ctx.body.code)) {
          throw ctx.error('UNAUTHORIZED', { message: 'The authenticator code is invalid.' })
        }

        const user = await ctx.context.internalAdapter.findUserById(userId)
        if (!user) {
          throw ctx.error('UNAUTHORIZED', { message: 'User not found.' })
        }
        const session = await issueSession(ctx, user)
        await ctx.setSignedCookie(FIREBASE_2FA_CHALLENGE_COOKIE, '', ctx.context.secret, {
          httpOnly: true,
          sameSite: 'lax',
          secure: shouldUseSecureCookies(),
          path: '/',
          maxAge: 0,
        })
        return ctx.json({ token: session.token })
      }),
    },
  }
}
