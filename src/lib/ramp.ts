import type {
  TellwiseRampInitiateRequest,
  TellwiseRampInitiateResponse,
  TellwiseRampProvider,
  TellwiseRampQuoteRequest,
  TellwiseRampQuoteResponse,
} from '@/lib/tellwise-service-contracts'

const DEFAULT_KES_PER_USDC = 129
const DEFAULT_FEE_BPS = 150
const DEFAULT_SETTLEMENT_CHAIN = 'base'

function toPositiveAmount(value: string) {
  const amount = Number.parseFloat(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

export function getRampProvider(): TellwiseRampProvider {
  const provider = process.env.TELLWISE_RAMP_PROVIDER?.trim().toLowerCase()
  if (provider === 'pretium' || provider === 'kotani' || provider === 'honeycoin') {
    return provider
  }
  return 'sandbox'
}

export function createRampQuote(request: TellwiseRampQuoteRequest): TellwiseRampQuoteResponse {
  const fiatAmount = toPositiveAmount(request.fiatAmount)
  if (request.fiatCurrency !== 'KES' || request.cryptoCurrency !== 'USDC' || fiatAmount <= 0) {
    throw new Error('Enter a valid KES amount.')
  }

  const exchangeRate = Number.parseFloat(process.env.TELLWISE_KES_PER_USDC || '') || DEFAULT_KES_PER_USDC
  const feeBps = Number.parseInt(process.env.TELLWISE_RAMP_FEE_BPS || '', 10)
  const normalizedFeeBps = Number.isFinite(feeBps) && feeBps >= 0 ? feeBps : DEFAULT_FEE_BPS
  const feeFiat = fiatAmount * (normalizedFeeBps / 10_000)
  const netFiat = Math.max(0, fiatAmount - feeFiat)
  const cryptoAmount = netFiat / exchangeRate
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  return {
    fiatCurrency: 'KES',
    fiatAmount: fiatAmount.toFixed(2),
    cryptoCurrency: 'USDC',
    cryptoAmount: cryptoAmount.toFixed(2),
    exchangeRate: exchangeRate.toFixed(2),
    feeFiat: feeFiat.toFixed(2),
    provider: getRampProvider(),
    settlementChain: process.env.TELLWISE_RAMP_SETTLEMENT_CHAIN || DEFAULT_SETTLEMENT_CHAIN,
    expiresAt,
  }
}

export function createRampDeposit(request: TellwiseRampInitiateRequest): TellwiseRampInitiateResponse {
  const phoneNumber = request.phoneNumber.trim()
  if (!/^\+?254\d{9}$|^0\d{9}$/.test(phoneNumber.replace(/\s+/g, ''))) {
    throw new Error('Enter a valid Kenyan phone number.')
  }

  const quote = createRampQuote(request)
  const depositId = `dep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  return {
    ...quote,
    depositId,
    status: 'PENDING_STK',
    phoneNumber,
    message: quote.provider === 'sandbox'
      ? 'Sandbox deposit created. Configure TELLWISE_RAMP_PROVIDER and credentials to trigger a real STK push.'
      : 'Deposit request created. Complete the mobile money prompt to receive USDC.',
  }
}
