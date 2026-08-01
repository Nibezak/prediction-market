import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/drizzle'
import { two_factors, users } from '@/lib/db/schema/auth/tables'
import {
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  verifyTotpCode,
} from '@/lib/two-factor'
import { DEFAULT_THEME_SITE_NAME } from '@/lib/theme-site-identity'
import 'server-only'

export async function beginTwoFactorEnrollment(userId: string, email: string) {
  const secret = generateTotpSecret()
  const backupCodes = generateBackupCodes()

  await db.transaction(async (tx) => {
    await tx.delete(two_factors).where(eq(two_factors.user_id, userId))
    await tx.insert(two_factors).values({
      id: randomUUID().replaceAll('-', '').slice(0, 26),
      user_id: userId,
      secret: encryptTotpSecret(secret),
      backup_codes: hashBackupCodes(backupCodes),
      verified: false,
    })
    await tx.update(users).set({ two_factor_enabled: false }).where(eq(users.id, userId))
  })

  return {
    totpURI: createTotpUri({ secret, email, issuer: DEFAULT_THEME_SITE_NAME }),
    backupCodes,
  }
}

export async function verifyTwoFactorEnrollment(userId: string, code: string) {
  const rows = await db
    .select({ id: two_factors.id, secret: two_factors.secret })
    .from(two_factors)
    .where(and(eq(two_factors.user_id, userId), eq(two_factors.verified, false)))
    .limit(1)

  const record = rows[0]
  if (!record || !verifyTotpCode(decryptTotpSecret(record.secret), code)) return false

  await db.transaction(async (tx) => {
    await tx.update(two_factors).set({ verified: true }).where(eq(two_factors.id, record.id))
    await tx.update(users).set({ two_factor_enabled: true }).where(eq(users.id, userId))
  })
  return true
}

export async function verifyUserTotp(userId: string, code: string) {
  const rows = await db
    .select({ secret: two_factors.secret })
    .from(two_factors)
    .where(and(eq(two_factors.user_id, userId), eq(two_factors.verified, true)))
    .limit(1)
  return Boolean(rows[0] && verifyTotpCode(decryptTotpSecret(rows[0].secret), code))
}

export async function disableUserTwoFactor(userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(two_factors).where(eq(two_factors.user_id, userId))
    await tx.update(users).set({ two_factor_enabled: false }).where(eq(users.id, userId))
  })
}
