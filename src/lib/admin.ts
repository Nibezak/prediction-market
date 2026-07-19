import { createHmac, timingSafeEqual } from 'node:crypto'

export const ADMIN_VERIFICATION_COOKIE_NAME = 'tellwise_admin_verified'
const ADMIN_VERIFICATION_COOKIE_MAX_AGE_SECONDS = 60 * 30

function parseAdminWalletsEnv(value: string): string[] {
  const trimmed = value.trim()

  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map(item => String(item).toLowerCase())
    }
  }
  catch {
    //
  }

  return trimmed
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

let cachedAdminWallets: string[] | null = null

function getAdminWallets(): string[] {
  if (cachedAdminWallets) {
    return cachedAdminWallets
  }

  const envValue = process.env.ADMIN_WALLETS
  if (!envValue) {
    cachedAdminWallets = []
    return cachedAdminWallets
  }

  cachedAdminWallets = parseAdminWalletsEnv(envValue)
  return cachedAdminWallets
}

export function isAdminWallet(address?: string | null): boolean {
  if (!address) {
    return false
  }

  return getAdminWallets().includes(address.toLowerCase())
}

function requireAdminEnv(name: 'ADMIN_VERIFICATION_EMAIL' | 'ADMIN_VERIFICATION_PASSPHRASE'): string {
  const value = process.env[name]?.trim()
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${name} is required for admin access.`)
    }
    return ''
  }
  return value
}

export function getAdminVerificationEmail(): string {
  return requireAdminEnv('ADMIN_VERIFICATION_EMAIL').toLowerCase()
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) {
    return false
  }

  const adminEmail = getAdminVerificationEmail()
  return Boolean(adminEmail) && email.trim().toLowerCase() === adminEmail
}

export function getAdminVerificationPassphrase(): string {
  return requireAdminEnv('ADMIN_VERIFICATION_PASSPHRASE')
}

export function verifyAdminPassphrase(passphrase: string): boolean {
  const expected = getAdminVerificationPassphrase()
  const received = passphrase.trim()
  if (!expected || !received) {
    return false
  }

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

function getAdminCookieSecret() {
  return process.env.BETTER_AUTH_SECRET?.trim() || process.env.ADMIN_VERIFICATION_PASSPHRASE?.trim() || ''
}

function signAdminVerificationPayload(payload: string) {
  const secret = getAdminCookieSecret()
  if (!secret) {
    return ''
  }
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function createAdminVerificationCookieValue(userId: string) {
  const expiresAt = Date.now() + ADMIN_VERIFICATION_COOKIE_MAX_AGE_SECONDS * 1000
  const payload = `${userId}.${expiresAt}`
  const signature = signAdminVerificationPayload(payload)
  if (!signature) {
    return ''
  }
  return `${payload}.${signature}`
}

export function verifyAdminVerificationCookieValue(value: string | undefined, userId: string) {
  if (!value || !userId) {
    return false
  }

  const [cookieUserId, expiresAtRaw, signature] = value.split('.')
  if (!cookieUserId || !expiresAtRaw || !signature || cookieUserId !== userId) {
    return false
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10)
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false
  }

  const payload = `${cookieUserId}.${expiresAtRaw}`
  const expected = signAdminVerificationPayload(payload)
  if (!expected || expected.length !== signature.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export function getAdminVerificationCookieMaxAge() {
  return ADMIN_VERIFICATION_COOKIE_MAX_AGE_SECONDS
}
