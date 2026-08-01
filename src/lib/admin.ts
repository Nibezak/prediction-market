const BUILT_IN_ADMIN_EMAILS = new Set([
  'kevin.nibeza@gmail.com',
  'admin@slimefish.com',
])

function parseEmailList(value: string | undefined) {
  return (value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

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

function requireAdminEmailEnv(): string {
  const name = 'ADMIN_VERIFICATION_EMAIL'
  const value = process.env[name]?.trim()
  if (!value) {
    return ''
  }
  return value
}

export function getAdminVerificationEmail(): string {
  return requireAdminEmailEnv().toLowerCase()
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) {
    return false
  }

  const normalizedEmail = email.trim().toLowerCase()
  const adminEmail = getAdminVerificationEmail()
  return BUILT_IN_ADMIN_EMAILS.has(normalizedEmail)
    || (Boolean(adminEmail) && normalizedEmail === adminEmail)
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) {
    return false
  }
  const normalizedEmail = email.trim().toLowerCase()
  return parseEmailList(process.env.SUPER_ADMIN_EMAILS).includes(normalizedEmail)
    || normalizedEmail === 'kevin.nibeza@gmail.com'
}
