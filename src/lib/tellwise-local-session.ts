import type { NextRequest } from 'next/server'
import type { User } from '@/types'
import { CLOB_ORDER_TYPE } from '@/lib/constants'
import { isAdminWallet } from '@/lib/admin'

export const TELLWISE_LOCAL_SESSION_COOKIE = 'tellwise_local_session'
export const TELLWISE_LOCAL_SESSION_VALUE = 'active'
export const TELLWISE_LOCAL_USER_ID = 'tellwise-local-admin'
export const TELLWISE_LOCAL_ADDRESS = '0x1111111111111111111111111111111111111111'

export interface TellwiseLocalSession {
  user: User
  session: {
    id: string
    userId: string
    expiresAt: string
  }
}

function parseListEnvValue(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map(item => String(item).trim()).filter(Boolean)
    }
  }
  catch {
    //
  }

  return trimmed
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export function isTellwiseLocalSessionEnabled(env?: NodeJS.ProcessEnv) {
  if (env) {
    return env.NEXT_PUBLIC_TELLWISE_LOCAL_LOGIN === 'true'
      || env.NEXT_PUBLIC_LOCAL_MATCHING === 'true'
      || env.NEXT_PUBLIC_MOCK_MODE === 'true'
  }

  return process.env.NEXT_PUBLIC_TELLWISE_LOCAL_LOGIN === 'true'
    || process.env.NEXT_PUBLIC_LOCAL_MATCHING === 'true'
    || process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
}

export function getTellwiseLocalUsername(env: NodeJS.ProcessEnv = process.env) {
  return env.TELLWISE_LOCAL_USERNAME?.trim()
    || parseListEnvValue(env.ADMIN_WALLETS)[0]
    || 'rabbit'
}

export function getTellwiseLocalEmail(env: NodeJS.ProcessEnv = process.env) {
  const configuredEmail = env.TELLWISE_LOCAL_EMAIL?.trim()
  if (configuredEmail) {
    return configuredEmail
  }

  const username = getTellwiseLocalUsername(env)
  return username.includes('@') ? username : `${username}@tellwise.local`
}

export function createTellwiseLocalUser(env: NodeJS.ProcessEnv = process.env): User {
  const username = getTellwiseLocalUsername(env)
  const email = getTellwiseLocalEmail(env)

  return {
    id: TELLWISE_LOCAL_USER_ID,
    address: TELLWISE_LOCAL_ADDRESS,
    email,
    twoFactorEnabled: false,
    username,
    image: '',
    settings: {
      trading: {
        market_order_type: CLOB_ORDER_TYPE.FAK,
        show_slippage_warning: false,
      },
    },
    affiliate_code: null,
    referred_by_user_id: null,
    is_admin: isAdminWallet(username) || isAdminWallet(email),
    deposit_wallet_address: null,
    deposit_wallet_signature: null,
    deposit_wallet_signed_at: null,
    deposit_wallet_status: 'not_started',
    deposit_wallet_tx_hash: null,
  }
}

export function createTellwiseLocalSession(env: NodeJS.ProcessEnv = process.env): TellwiseLocalSession {
  const user = createTellwiseLocalUser(env)

  return {
    user,
    session: {
      id: 'tellwise-local-session',
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  }
}

function hasActiveTellwiseLocalCookie(cookieValue: string | undefined | null) {
  return cookieValue === TELLWISE_LOCAL_SESSION_VALUE || cookieValue === 'true'
}

export function getTellwiseLocalSessionFromRequest(request: NextRequest) {
  if (!isTellwiseLocalSessionEnabled()) {
    return null
  }

  const cookieValue = request.cookies.get(TELLWISE_LOCAL_SESSION_COOKIE)?.value
    ?? request.cookies.get('mock_logged_in')?.value

  return hasActiveTellwiseLocalCookie(cookieValue) ? createTellwiseLocalSession() : null
}

export function getTellwiseLocalSessionFromHeaders(headers: Headers) {
  if (!isTellwiseLocalSessionEnabled()) {
    return null
  }

  const cookieHeader = headers.get('cookie')
  if (!cookieHeader) {
    return null
  }

  const cookies = new Map(
    cookieHeader
      .split(';')
      .map((part) => {
        const [name, ...valueParts] = part.trim().split('=')
        return [name, decodeURIComponent(valueParts.join('='))]
      })
      .filter(([name]) => Boolean(name)),
  )

  const cookieValue = cookies.get(TELLWISE_LOCAL_SESSION_COOKIE) ?? cookies.get('mock_logged_in')
  return hasActiveTellwiseLocalCookie(cookieValue) ? createTellwiseLocalSession() : null
}
