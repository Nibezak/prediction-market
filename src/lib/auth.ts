import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { and, eq, sql } from 'drizzle-orm'

import { betterAuth } from 'better-auth'

import { nextCookies } from 'better-auth/next-js'

import { customSession, twoFactor } from 'better-auth/plugins'

import { isAdminEmail, isAdminWallet, isSuperAdminEmail } from '@/lib/admin'

import { AffiliateRepository } from '@/lib/db/queries/affiliate'

import { db } from '@/lib/drizzle'

import resolveSiteUrl from '@/lib/site-url'

import { syncUserToSlimefishBackend } from '@/lib/slimefish-backend-sync'

import { getPublicAssetUrl } from '@/lib/storage'

import { DEFAULT_THEME_SITE_NAME } from '@/lib/theme-site-identity'

import { ensureUserTradingAuthSecretFingerprint } from '@/lib/trading-auth/server'

import { sanitizeTradingAuthSettings } from '@/lib/trading-auth/utils'

import { isWalletPlaceholderEmail } from '@/lib/user-email'
import { getUserPlatformRole } from '@/lib/staff-role'
import { STAFF_PERMISSIONS } from '@/lib/staff-permissions'
import { firebaseAuthPlugin } from '@/lib/firebase-auth-plugin'

import * as schema from './db/schema'



const AFFILIATE_COOKIE_NAME = 'platform_affiliate'

const AFFILIATE_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const SITE_URL = resolveSiteUrl(process.env)

const siteUrlObject = new URL(SITE_URL)

const SIWE_DOMAIN = siteUrlObject.host

const SIWE_EMAIL_DOMAIN = siteUrlObject.hostname || 'kuest.com'

const BUILD_ONLY_BETTER_AUTH_SECRET = 'runtime-env-only-build-placeholder-secret-32-chars-minimum'

async function ensureSuperAdminEmailUser(userId: string, email: string, settings: Record<string, any> | undefined) {
  if (!userId || !isSuperAdminEmail(email)) {
    return settings
  }
  if (settings?.staff_role === 'SUPER_ADMIN') {
    return settings
  }
  const nextSettings = {
    ...(settings || {}),
    staff_role: 'SUPER_ADMIN',
    staff_permissions: STAFF_PERMISSIONS,
    super_admin_auto_elevated: true,
  }
  await db.update(schema.users).set({
    settings: sql`COALESCE(${schema.users.settings}, '{}'::jsonb) || ${JSON.stringify(nextSettings)}::jsonb`,
  }).where(eq(schema.users.id, userId))
  const existingElevationNotice = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(
      eq(schema.notifications.user_id, userId),
      eq(schema.notifications.title, 'Your account has been elevated'),
      sql`${schema.notifications.metadata}->>'role' = 'SUPER_ADMIN'`,
    ))
    .limit(1)

  if (!existingElevationNotice.length) {
    await db.insert(schema.notifications).values({
      user_id: userId,
      category: 'account',
      title: 'Your account has been elevated',
      description: 'Congrats, your Slimefish account is now super admin. Enable two-factor authentication before opening admin tools.',
      metadata: { role: 'SUPER_ADMIN', autoElevated: true },
      link_type: 'settings',
      link_target: '/settings/account',
      link_url: '/settings/account',
      link_label: 'Enable 2FA',
    })
  }
  return nextSettings
}



function resolveBetterAuthSecret() {

  if (process.env.BETTER_AUTH_SECRET?.trim()) {

    return process.env.BETTER_AUTH_SECRET

  }



  if (!process.env.POSTGRES_URL?.trim()) {

    return BUILD_ONLY_BETTER_AUTH_SECRET

  }



  return undefined

}



function parseTimestampMs(value: unknown): number | null {

  if (value === null || value === undefined) {

    return null

  }

  if (value instanceof Date) {

    return value.getTime()

  }

  if (typeof value === 'number') {

    return Number.isFinite(value) ? value : null

  }

  const parsed = Date.parse(String(value))

  return Number.isNaN(parsed) ? null : parsed

}



function parseAffiliateCookie(rawValue: string | null) {

  if (!rawValue) {

    return null

  }

  try {

    const parsed = JSON.parse(rawValue) as Record<string, unknown>

    return {

      affiliateCode: typeof parsed.affiliateCode === 'string' ? parsed.affiliateCode : undefined,

      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined,

    }

  }

  catch {

    return null

  }

}



export const auth = betterAuth({

  database: drizzleAdapter(db, {

    provider: 'pg',

    schema,

  }),

  appName: DEFAULT_THEME_SITE_NAME,

  secret: resolveBetterAuthSecret(),

  baseURL: SITE_URL,

  emailAndPassword: {
    // Password credentials are owned by Firebase. Keeping Better Auth's parallel
    // password endpoints enabled would bypass Firebase email verification.
    enabled: false,
  },

  advanced: {

    database: {

      generateId: false,

    },

  },

  databaseHooks: {

    user: {

      create: {

        async after(user, ctx) {

          try {

            await syncUserToSlimefishBackend({

              id: user.id,

              email: user.email,

              username: (user as any).username,

            })

          }

          catch (error) {

            ctx?.context.logger.error('Failed to provision Slimefish ledger signup balance', error)

          }

          if (!ctx) {

            return

          }



          const referral = parseAffiliateCookie(ctx.getCookie(AFFILIATE_COOKIE_NAME))

          if (!referral?.affiliateCode) {

            return

          }



          const referralTimestamp = parseTimestampMs(referral.timestamp)

          if (referralTimestamp === null) {

            return

          }



          const now = Date.now()

          if (referralTimestamp > now || now - referralTimestamp > AFFILIATE_COOKIE_MAX_AGE_MS) {

            return

          }



          try {

            const { data: affiliate } = await AffiliateRepository.getAffiliateByCode(referral.affiliateCode)

            const affiliateUserId = affiliate?.id ?? null



            if (!affiliateUserId || affiliateUserId === user.id) {

              return

            }



            await AffiliateRepository.recordReferral({

              user_id: user.id,

              affiliate_user_id: affiliateUserId,

            })

            ctx.setCookie(AFFILIATE_COOKIE_NAME, '', { path: '/', maxAge: 0 })

          }

          catch (error) {

            ctx.context.logger.error('Failed to record affiliate referral', error)

          }

        },

      },

    },

  },

  plugins: [
    firebaseAuthPlugin(),

    customSession(async ({ user, session }) => {

      const userId = String((user as any).id ?? '')

      const email = isWalletPlaceholderEmail(user.email, [SIWE_EMAIL_DOMAIN]) ? '' : user.email

      const rawSettings = (user as any).settings as Record<string, any> | undefined

      const hydratedSettings = rawSettings && userId

        ? await ensureUserTradingAuthSecretFingerprint(userId, rawSettings)

        : rawSettings

      const elevatedSettings = await ensureSuperAdminEmailUser(userId, user.email, hydratedSettings)

      const settings = elevatedSettings

        ? sanitizeTradingAuthSettings(elevatedSettings)

        : elevatedSettings

      const isAdmin = isAdminWallet(user.name) || isAdminWallet(user.email) || isAdminWallet((user as any).username) || isAdminEmail(user.email)
      const role = getUserPlatformRole({
        email: user.email,
        is_admin: isAdmin,
        settings,
      } as any)



      return {

        user: {

          ...user,

          email,

          settings,

          image: user.image ? getPublicAssetUrl(user.image) : '',

          is_admin: isAdmin,
          is_staff: role !== 'USER',
          role,

        },

        session,

      }

    }),

    twoFactor({

      allowPasswordless: true,

      skipVerificationOnEnable: false,

      schema: {

        user: {

          fields: {

            twoFactorEnabled: 'two_factor_enabled',

          },

        },

        twoFactor: {

          modelName: 'two_factors',

          fields: {

            secret: 'secret',

            backupCodes: 'backup_codes',

            userId: 'user_id',

          },

        },

      },

    }),

    nextCookies(),

  ],

  user: {

    modelName: 'users',

    fields: {

      name: 'address',

      email: 'email',

      emailVerified: 'email_verified',

      image: 'image',

      createdAt: 'created_at',

      updatedAt: 'updated_at',

    },

    additionalFields: {

      address: {

        type: 'string',

      },

      username: {

        type: 'string',

      },

      settings: {

        type: 'json',

      },

      deposit_wallet_address: {

        type: 'string',

      },

      deposit_wallet_signature: {

        type: 'string',

      },

      deposit_wallet_status: {

        type: 'string',

      },

      deposit_wallet_signed_at: {

        type: 'date',

      },

      deposit_wallet_tx_hash: {

        type: 'string',

      },

      affiliate_code: {

        type: 'string',

      },

      referred_by_user_id: {

        type: 'string',

      },

    },

    changeEmail: {

      enabled: true,

    },

  },

  session: {

    modelName: 'sessions',

    cookieCache: {

      enabled: true,

      maxAge: 5 * 60,

    },

    fields: {

      userId: 'user_id',

      token: 'token',

      expiresAt: 'expires_at',

      ipAddress: 'ip_address',

      userAgent: 'user_agent',

      createdAt: 'created_at',

      updatedAt: 'updated_at',

    },

  },

  account: {

    modelName: 'accounts',

    fields: {

      userId: 'user_id',

      accountId: 'account_id',

      providerId: 'provider_id',

      accessToken: 'access_token',

      refreshToken: 'refresh_token',

      idToken: 'id_token',

      accessTokenExpiresAt: 'access_token_expires_at',

      refreshTokenExpiresAt: 'refresh_token_expires_at',

      scope: 'scope',

      password: 'password',

      createdAt: 'created_at',

      updatedAt: 'updated_at',

    },

  },

  verification: {

    modelName: 'verifications',

    fields: {

      identifier: 'identifier',

      value: 'value',

      expiresAt: 'expires_at',

      createdAt: 'created_at',

      updatedAt: 'updated_at',

    },

  },

})

