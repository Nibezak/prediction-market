import type { SQL } from 'drizzle-orm'
import type { DepositWalletStatus, User } from '@/types'
import { asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { AffiliateRepository } from '@/lib/db/queries/affiliate'
import { getOrCreateTellwiseLocalDbSession } from '@/lib/db/queries/tellwise-local-user'
import { affiliate_referrals } from '@/lib/db/schema/affiliates/tables'
import { accounts, sessions, two_factors, users, verifications, wallets } from '@/lib/db/schema/auth/tables'
import { orders } from '@/lib/db/schema/orders/tables'
import { runQuery } from '@/lib/db/utils/run-query'
import { isDepositWalletDeployed } from '@/lib/deposit-wallet'
import { db } from '@/lib/drizzle'
import { getPublicAssetUrl } from '@/lib/storage'
import { getTellwiseLocalSessionFromHeaders } from '@/lib/tellwise-local-session'
import { normalizeAddress } from '@/lib/wallet'
import { isAdminEmail } from '@/lib/admin'
import { isProtectedSuperAdmin } from '@/lib/staff-role'
import { MIRROR_COOKIE_NAME, readCookie, verifyMirrorCookie } from '@/lib/user-mirroring'
import { hasStaffPermission } from '@/lib/staff-permissions'

async function applyMirrorSession(user: any, requestHeaders: Headers) {
  if (!user?.id || (!isAdminEmail(user.email) && !hasStaffPermission(user, 'users.mirror'))) return user
  const mirror = verifyMirrorCookie(readCookie(requestHeaders.get('cookie'), MIRROR_COOKIE_NAME), user.id)
  if (!mirror) return user
  const rows = await db.select().from(users).where(eq(users.id, mirror.targetUserId)).limit(1)
  const target: any = rows[0]
  if (!target) return user
  const settings = target.settings && typeof target.settings === 'object' ? target.settings : {}
  return {
    ...target,
    image: target.image ? getPublicAssetUrl(target.image) : '',
    role: (settings as any).staff_role || 'USER',
    is_admin: false,
    mirrored_by_user_id: user.id,
  }
}

function sanitizeUserSearchTerm(search: string) {
  return search
    .trim()
    .replace(/[,()]/g, ' ')
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildUsernameSearchCondition(searchTerm: string) {
  const loweredUsername = sql<string>`LOWER(${users.username})`
  return ilike(loweredUsername, `%${searchTerm.toLowerCase()}%`)
}

export const UserRepository = {
  async getProfileByUsernameOrDepositWalletAddress(username: string) {
    return await runQuery(async () => {
      const normalizedUsername = username.toLowerCase()
      const result = await db
        .select({
          id: users.id,
          email: users.email,
          settings: users.settings,
          deposit_wallet_address: users.deposit_wallet_address,
          username: users.username,
          image: users.image,
          created_at: users.created_at,
        })
        .from(users)
        .where(or(
          eq(sql`LOWER(${users.username})`, normalizedUsername),
          eq(sql`LOWER(${users.deposit_wallet_address})`, normalizedUsername),
        ))
        .limit(1)

      const rawData = result[0] || null

      if (!rawData) {
        return { data: null, error: null }
      }

      const data = {
        id: rawData.id,
        email: rawData.email,
        settings: rawData.settings,
        deposit_wallet_address: rawData.deposit_wallet_address,
        username: rawData.username!,
        image: rawData.image ? getPublicAssetUrl(rawData.image) : '',
        created_at: rawData.created_at,
      }

      return { data, error: null }
    })
  },

  async updateUserProfileById(userId: string, input: any) {
    return runQuery(async () => {
      try {
        const result = await db
          .update(users)
          .set(input)
          .where(eq(users.id, userId))
          .returning()

        const data = result[0] as typeof users.$inferSelect | undefined

        if (!data) {
          return { data: null, error: 'User not found.' }
        }

        return { data: data!, error: null }
      }
      catch (error: any) {
        const cause = error.cause?.toString() ?? error.toString()

        if (cause.includes('idx_users_email') || cause.includes('users_email_unique')) {
          return { data: null, error: 'Email is already taken.' }
        }

        if (cause.includes('idx_users_username') || cause.includes('users_username_unique')) {
          return { data: null, error: 'Username is already taken.' }
        }

        return { data: null, error: 'Failed to update user.' }
      }
    })
  },

  async updateUserNotificationSettings(currentUser: User, preferences: any) {
    return await runQuery(async () => {
      const preferencesJson = JSON.stringify(preferences ?? {})

      const result = await db
        .update(users)
        .set({
          settings: sql`
            jsonb_set(
              CASE
                WHEN jsonb_typeof(coalesce(${users.settings}, '{}'::jsonb)) = 'object'
                  THEN coalesce(${users.settings}, '{}'::jsonb)
                ELSE '{}'::jsonb
              END,
              '{notifications}',
              ${preferencesJson}::jsonb,
              true
            )
          `,
        })
        .where(eq(users.id, currentUser.id))
        .returning({ id: users.id })

      const data = result[0] || null

      if (!data) {
        return { data: null, error: DEFAULT_ERROR_MESSAGE }
      }

      return { data, error: null }
    })
  },

  async updateUserTradingSettings(
    currentUser: User,
    preferences: { show_slippage_warning?: boolean },
  ) {
    const tradingPatchEntries: SQL[] = []

    if (preferences.show_slippage_warning !== undefined) {
      const showSlippageWarning = preferences.show_slippage_warning
      tradingPatchEntries.push(sql`'show_slippage_warning', to_jsonb(${showSlippageWarning}::boolean)`)
    }

    if (tradingPatchEntries.length === 0) {
      return { data: { id: currentUser.id }, error: null }
    }

    return await runQuery(async () => {
      const tradingPatch = sql`jsonb_build_object(${sql.join(tradingPatchEntries, sql`, `)})`
      const normalizedSettings = sql`
        CASE
          WHEN jsonb_typeof(coalesce(${users.settings}, '{}'::jsonb)) = 'object'
            THEN coalesce(${users.settings}, '{}'::jsonb)
          ELSE '{}'::jsonb
        END
      `

      const result = await db
        .update(users)
        .set({
          settings: sql`
            jsonb_set(
              ${normalizedSettings},
              '{trading}',
              (
                CASE
                  WHEN jsonb_typeof(${normalizedSettings}->'trading') = 'object'
                    THEN ${normalizedSettings}->'trading'
                  ELSE '{}'::jsonb
                END
                || ${tradingPatch}
              ),
              true
            )
          `,
        })
        .where(eq(users.id, currentUser.id))
        .returning({ id: users.id })

      const data = result[0] || null

      if (!data) {
        return { data: null, error: DEFAULT_ERROR_MESSAGE }
      }

      return { data, error: null }
    })
  },

  async updateUserDisplaySettings(
    currentUser: User,
    preferences: { show_home_featured_mobile?: boolean },
  ) {
    if (preferences.show_home_featured_mobile === undefined) {
      return { data: { id: currentUser.id }, error: null }
    }

    return await runQuery(async () => {
      const showHomeFeaturedMobile = preferences.show_home_featured_mobile
      const normalizedSettings = sql`
        CASE
          WHEN jsonb_typeof(coalesce(${users.settings}, '{}'::jsonb)) = 'object'
            THEN coalesce(${users.settings}, '{}'::jsonb)
          ELSE '{}'::jsonb
        END
      `

      const result = await db
        .update(users)
        .set({
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
                || jsonb_build_object('show_home_featured_mobile', to_jsonb(${showHomeFeaturedMobile}::boolean))
              ),
              true
            )
          `,
        })
        .where(eq(users.id, currentUser.id))
        .returning({ id: users.id })

      const data = result[0] || null
      return data ? { data, error: null } : { data: null, error: DEFAULT_ERROR_MESSAGE }
    })
  },

  async deleteUserAccountById(userId: string) {
    return await runQuery(async () => {
      await db.transaction(async (tx) => {
        const targetRows = await tx.select({ email: users.email, settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1)
        if (isProtectedSuperAdmin(targetRows[0] as any)) {
          throw new Error('The super admin account cannot be deleted.')
        }

        await tx
          .update(orders)
          .set({ affiliate_user_id: null })
          .where(eq(orders.affiliate_user_id, userId))

        await tx.delete(orders).where(eq(orders.user_id, userId))
        await tx
          .delete(affiliate_referrals)
          .where(or(
            eq(affiliate_referrals.user_id, userId),
            eq(affiliate_referrals.affiliate_user_id, userId),
          ))
        await tx.delete(two_factors).where(eq(two_factors.user_id, userId))
        await tx.delete(wallets).where(eq(wallets.user_id, userId))
        await tx.delete(accounts).where(eq(accounts.user_id, userId))
        await tx.delete(sessions).where(eq(sessions.user_id, userId))
        await tx.delete(verifications).where(eq(verifications.value, userId))
        await tx
          .update(users)
          .set({ referred_by_user_id: null })
          .where(eq(users.referred_by_user_id, userId))
        await tx.delete(users).where(eq(users.id, userId))
      })

      return { data: { id: userId }, error: null }
    })
  },

  async getCurrentUser({
    disableCookieCache = false,
    minimal = false,
  }: { disableCookieCache?: boolean, minimal?: boolean } = {}) {
    try {
      const requestHeaders = await headers()
      const localSession = getTellwiseLocalSessionFromHeaders(requestHeaders)
      if (localSession?.user) {
        const dbLocalSession = await getOrCreateTellwiseLocalDbSession().catch(() => localSession)
        const user = await applyMirrorSession(dbLocalSession.user as any, requestHeaders)

        if (minimal) {
          return user
        }

        if (!user.affiliate_code) {
          try {
            const { data: code } = await AffiliateRepository.ensureUserAffiliateCode(user.id)
            if (code) {
              user.affiliate_code = code
            }
          }
          catch (error) {
            console.error('Failed to ensure affiliate code', error)
          }
        }

        return user
      }

      const session = await auth.api.getSession({
        query: {
          disableCookieCache,
        },
        headers: requestHeaders,
      })

      if (!session?.user) {
        return null
      }

      const user: any = await applyMirrorSession(session.user, requestHeaders)

      if (minimal) {
        return user
      }

      if (!user.affiliate_code) {
        try {
          const { data: code } = await AffiliateRepository.ensureUserAffiliateCode(user.id)
          if (code) {
            user.affiliate_code = code
          }
        }
        catch (error) {
          console.error('Failed to ensure affiliate code', error)
        }
      }

      await ensureUserDepositWallet(user)

      return user
    }
    catch {
      return null
    }
  },

  async listUsers(params: {
    limit?: number
    offset?: number
    search?: string
    sortBy?: 'username' | 'email' | 'address' | 'created_at'
    sortOrder?: 'asc' | 'desc'
    searchByUsernameOnly?: boolean
  } = {}) {
    'use cache'

    const { data, error } = await runQuery(async () => {
      const {
        limit: rawLimit = 100,
        offset = 0,
        search,
        sortBy = 'created_at',
        sortOrder = 'desc',
        searchByUsernameOnly = false,
      } = params

      const limit = Math.min(Math.max(rawLimit, 1), 1000)

      let whereCondition
      if (search && search.trim()) {
        const sanitizedSearchTerm = sanitizeUserSearchTerm(search)

        if (sanitizedSearchTerm) {
          const usernameCondition = buildUsernameSearchCondition(sanitizedSearchTerm)
          whereCondition = searchByUsernameOnly
            ? usernameCondition
            : or(
                usernameCondition,
                ilike(users.email, `%${sanitizedSearchTerm}%`),
                ilike(users.address, `%${sanitizedSearchTerm}%`),
                ilike(users.deposit_wallet_address, `%${sanitizedSearchTerm}%`),
              )
        }
      }

      let orderByClause
      if (sortBy === 'username') {
        const sortDirection = sortOrder === 'asc' ? asc : desc
        orderByClause = [sortDirection(users.username), sortDirection(users.address)]
      }
      else {
        let sortColumn
        switch (sortBy) {
          case 'email':
            sortColumn = users.email
            break
          case 'address':
            sortColumn = users.address
            break
          case 'created_at':
            sortColumn = users.created_at
            break
          default:
            sortColumn = users.created_at
        }
        const sortDirection = sortOrder === 'asc' ? asc : desc
        orderByClause = [sortDirection(sortColumn)]
      }

      const queryBuilder = db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          address: users.address,
          deposit_wallet_address: users.deposit_wallet_address,
          created_at: users.created_at,
          image: users.image,
          affiliate_code: users.affiliate_code,
          referred_by_user_id: users.referred_by_user_id,
        })
        .from(users)

      const rows = await (whereCondition
        ? queryBuilder.where(whereCondition).orderBy(...orderByClause).limit(limit).offset(offset)
        : queryBuilder.orderBy(...orderByClause).limit(limit).offset(offset))

      const countQueryBuilder = db
        .select({ count: count() })
        .from(users)

      const countResult = await (whereCondition
        ? countQueryBuilder.where(whereCondition)
        : countQueryBuilder)
      const totalCount = countResult[0]?.count || 0

      return { data: { users: rows, count: totalCount }, error: null }
    })

    if (!data || error) {
      return { data: null, error: error || DEFAULT_ERROR_MESSAGE, count: 0 }
    }

    return { data: data.users, error: null, count: data.count }
  },

  async searchPublicProfiles(params: {
    limit?: number
    search: string
  }) {
    'use cache'

    const { data, error } = await runQuery(async () => {
      const sanitizedSearchTerm = sanitizeUserSearchTerm(params.search)

      if (!sanitizedSearchTerm) {
        return { data: [], error: null }
      }

      const limit = Math.min(Math.max(params.limit ?? 10, 1), 100)
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          settings: users.settings,
          address: users.address,
          deposit_wallet_address: users.deposit_wallet_address,
          created_at: users.created_at,
          image: users.image,
        })
        .from(users)
        .where(buildUsernameSearchCondition(sanitizedSearchTerm))
        .orderBy(asc(users.username), asc(users.address))
        .limit(limit)

      return { data: rows, error: null }
    })

    if (!data || error) {
      return { data: null, error: error || DEFAULT_ERROR_MESSAGE }
    }

    return { data, error: null }
  },

  async getUsersByIds(ids: string[]) {
    if (!ids.length) {
      return { data: [], error: null }
    }

    return await runQuery(async () => {
      const result = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          settings: users.settings,
          address: users.address,
          deposit_wallet_address: users.deposit_wallet_address,
          image: users.image,
          created_at: users.created_at,
        })
        .from(users)
        .where(inArray(users.id, ids))

      return { data: result, error: null }
    })
  },

  async getUsersByAddresses(addresses: string[]) {
    const normalizedAddresses = Array.from(new Set(
      (addresses || [])
        .map(address => normalizeAddress(address)?.toLowerCase())
        .filter(Boolean) as string[],
    ))

    if (!normalizedAddresses.length) {
      return { data: [], error: null }
    }

    return await runQuery(async () => {
      const addressClauses = normalizedAddresses.map(addr => eq(sql`LOWER(${users.address})`, addr))
      const depositWalletClauses = normalizedAddresses.map(addr => eq(sql`LOWER(${users.deposit_wallet_address})`, addr))
      const whereConditions = [...addressClauses, ...depositWalletClauses].filter(Boolean)
      const whereClause = whereConditions.length > 1
        ? or(...whereConditions)
        : whereConditions[0]

      if (!whereClause) {
        return { data: [], error: null }
      }

      const result = await db
        .select({
          id: users.id,
          username: users.username,
          address: users.address,
          deposit_wallet_address: users.deposit_wallet_address,
          image: users.image,
          created_at: users.created_at,
        })
        .from(users)
        .where(whereClause)

      return { data: result, error: null }
    })
  },
}

async function ensureUserDepositWallet(user: any): Promise<string | null> {
  const hasDepositWalletAddress = typeof user?.deposit_wallet_address === 'string' && user.deposit_wallet_address.startsWith('0x')
  if (!hasDepositWalletAddress) {
    return null
  }

  try {
    const depositWalletAddress = user.deposit_wallet_address as `0x${string}`
    let nextStatus: DepositWalletStatus = (user.deposit_wallet_status as DepositWalletStatus | null) ?? 'not_started'
    const updates: Record<string, any> = {}

    const shouldCheckDeployment = user.deposit_wallet_status !== 'deployed'
    if (shouldCheckDeployment) {
      const deployed = await isDepositWalletDeployed(depositWalletAddress)
      if (deployed) {
        nextStatus = 'deployed'
      }
    }

    if (nextStatus !== user.deposit_wallet_status) {
      updates.deposit_wallet_status = nextStatus
      if (nextStatus === 'deployed') {
        updates.deposit_wallet_tx_hash = null
      }
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(users)
        .set(updates)
        .where(eq(users.id, user.id))
    }

    user.deposit_wallet_address = depositWalletAddress
    user.deposit_wallet_status = nextStatus
    if (nextStatus === 'deployed') {
      user.deposit_wallet_tx_hash = null
    }

    return depositWalletAddress
  }
  catch (error) {
    console.error('Failed to ensure Deposit Wallet metadata', error)
  }

  return null
}
