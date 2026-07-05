import type { User } from '@/types'
import { eq, or, sql } from 'drizzle-orm'
import { isAdminWallet } from '@/lib/admin'
import { users } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { createTellwiseLocalSession, TELLWISE_LOCAL_USER_ID } from '@/lib/tellwise-local-session'

function serializeDbLocalUser(dbUser: typeof users.$inferSelect, fallback: User): User {
  const username = dbUser.username || fallback.username
  const email = dbUser.email || fallback.email

  return {
    ...fallback,
    id: dbUser.id,
    address: dbUser.address || fallback.address,
    email,
    username,
    image: dbUser.image || '',
    settings: dbUser.settings ?? fallback.settings,
    affiliate_code: dbUser.affiliate_code,
    referred_by_user_id: dbUser.referred_by_user_id,
    is_admin: isAdminWallet(username) || isAdminWallet(email) || isAdminWallet(dbUser.address),
    deposit_wallet_address: dbUser.deposit_wallet_address,
    deposit_wallet_signature: dbUser.deposit_wallet_signature,
    deposit_wallet_signed_at: dbUser.deposit_wallet_signed_at?.toISOString() ?? null,
    deposit_wallet_status: dbUser.deposit_wallet_status as User['deposit_wallet_status'],
    deposit_wallet_tx_hash: dbUser.deposit_wallet_tx_hash,
  }
}

export async function getOrCreateTellwiseLocalDbSession() {
  const session = createTellwiseLocalSession()
  const fallbackUser = session.user
  const username = fallbackUser.username.toLowerCase()
  const email = fallbackUser.email.toLowerCase()

  const existingRows = await db
    .select()
    .from(users)
    .where(or(
      eq(users.id, TELLWISE_LOCAL_USER_ID),
      eq(sql`LOWER(${users.username})`, username),
      eq(sql`LOWER(${users.email})`, email),
    ))
    .limit(1)

  const existingUser = existingRows[0]
  if (existingUser) {
    return {
      ...session,
      user: serializeDbLocalUser(existingUser, fallbackUser),
      session: {
        ...session.session,
        userId: existingUser.id,
      },
    }
  }

  await db
    .insert(users)
    .values({
      id: fallbackUser.id,
      address: fallbackUser.address,
      email: fallbackUser.email,
      email_verified: true,
      image: fallbackUser.image || null,
      username: fallbackUser.username,
      settings: fallbackUser.settings,
      deposit_wallet_address: fallbackUser.deposit_wallet_address ?? null,
      deposit_wallet_signature: fallbackUser.deposit_wallet_signature ?? null,
      deposit_wallet_status: fallbackUser.deposit_wallet_status ?? 'not_started',
      deposit_wallet_tx_hash: fallbackUser.deposit_wallet_tx_hash ?? null,
      affiliate_code: fallbackUser.affiliate_code ?? null,
      referred_by_user_id: fallbackUser.referred_by_user_id ?? null,
    })

  return session
}
