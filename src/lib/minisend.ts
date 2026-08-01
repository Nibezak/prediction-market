import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const MINISEND_BASE_URL = 'https://merchant.minisend.xyz'

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not configured.`)
  }
  return value
}

function minisendApiKey() {
  return requireEnv('MINISEND_API_KEY')
}

export function getMinisendMasterWalletAddress() {
  return requireEnv('MINISEND_MASTER_WALLET_ADDRESS')
}

export function getMinisendPaymentLinkUrl() {
  return requireEnv('MINISEND_PAYMENT_LINK_URL')
}

async function minisendFetch<T>(path: string, init: RequestInit & { idempotencyKey?: string, timeoutMs?: number } = {}) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${minisendApiKey()}`)
  headers.set('Content-Type', 'application/json')
  if (init.idempotencyKey) {
    headers.set('Idempotency-Key', init.idempotencyKey)
  }

  const response = await fetch(`${MINISEND_BASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Minisend request failed.'
    throw new Error(message)
  }
  return payload as T
}

export interface MinisendOnrampQuote {
  amount_kes: number
  fee_kes: number
  net_kes: number
  amount_usdc: number
  rate: number
  expires_at: string
}

export interface MinisendOnrampOrder extends MinisendOnrampQuote {
  order_id: string
  status: string
  amount_local: number
  fee: number
  customer_phone: string
  release_address: string
  release_chain: string
  release_asset: string
  external_reference: string
  instructions?: string
}

export interface MinisendCheckoutSession {
  session_id: string
  checkout_url: string
  deposit_address?: string
  amount_usdc: number
  status: string
  expires_at: string
  external_id?: string
}

export interface MinisendOfframpQuote {
  amount_usdc: number
  currency: string
  rate: number
  amount_local: number
  fee: number
  recipient_amount: number
  expires_at: string
  recipient_name?: string | null
}

export interface MinisendOfframpOrder extends MinisendOfframpQuote {
  order_id: string
  status: string
  total_deposit_usdc: number
  deposit_address: string
  deposit_chain: string
  refund_address: string
  external_reference: string
  instructions: string
  created_at: string
  deposit_tx_hash?: string | null
  completed_at?: string | null
}

export function normalizeMinisendSignature(value: string) {
  return value.trim().replace(/^sha256=/i, '').toLowerCase()
}

export function verifyMinisendWebhook(rawBody: string, signature: string) {
  const secret = requireEnv('MINISEND_WEBHOOK_SECRET')
  const supplied = normalizeMinisendSignature(signature)
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const suppliedBuffer = Buffer.from(supplied, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error('Minisend webhook signature is invalid.')
  }
  return {
    payloadHash: createHash('sha256').update(rawBody).digest('hex'),
    signatureDigest: createHash('sha256').update(supplied).digest('hex'),
  }
}

export async function quoteMinisendOnramp(input: { amountKes?: number, amountUsdc?: number }) {
  const body = input.amountKes != null
    ? { currency: 'KES', amount_kes: input.amountKes }
    : { currency: 'KES', amount_usdc: input.amountUsdc }
  return minisendFetch<MinisendOnrampQuote>('/api/onramp/quote', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function createMinisendOnrampOrder(input: {
  amountKes?: number
  amountUsdc?: number
  phone: string
  reference: string
  idempotencyKey: string
}) {
  const body = {
    currency: 'KES',
    ...(input.amountKes != null ? { amount_kes: input.amountKes } : { amount_usdc: input.amountUsdc }),
    phone: input.phone,
    address: getMinisendMasterWalletAddress(),
    reference: input.reference,
  }
  return minisendFetch<MinisendOnrampOrder>('/api/onramp/orders', {
    method: 'POST',
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify(body),
  })
}

export async function createMinisendCheckoutSession(input: {
  amount: number
  externalId: string
  customerEmail?: string | null
  description?: string
}) {
  return minisendFetch<MinisendCheckoutSession>('/api/merchant/checkout', {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amount,
      external_id: input.externalId,
      customer_email: input.customerEmail || undefined,
      description: input.description || 'Slimefish deposit',
    }),
  })
}

export async function quoteMinisendOfframp(input: { amount: number, currency?: string, recipient?: Record<string, unknown> }) {
  return minisendFetch<MinisendOfframpQuote>('/api/offramp/quote', {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency || 'KES',
      recipient: input.recipient,
    }),
  })
}

export async function createMinisendOfframpOrder(input: {
  amount: number
  currency?: string
  recipient: Record<string, unknown>
  reference: string
  idempotencyKey: string
}) {
  return minisendFetch<MinisendOfframpOrder>('/api/offramp/orders', {
    method: 'POST',
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency || 'KES',
      refund_address: getMinisendMasterWalletAddress(),
      recipient: input.recipient,
      reference: input.reference,
    }),
  })
}

export async function getMinisendOfframpOrder(orderId: string) {
  return minisendFetch<MinisendOfframpOrder>(`/api/offramp/orders/${encodeURIComponent(orderId)}`)
}

export async function submitMinisendOfframpDeposit(input: { orderId: string, transactionHash: string }) {
  return minisendFetch<MinisendOfframpOrder>(`/api/offramp/orders/${encodeURIComponent(input.orderId)}/deposit`, {
    method: 'POST',
    body: JSON.stringify({ transaction_hash: input.transactionHash }),
  })
}
