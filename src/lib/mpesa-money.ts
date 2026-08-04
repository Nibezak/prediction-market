export const MIN_MPESA_DEPOSIT_KES = 10
export const MAX_MPESA_DEPOSIT_KES = 250_000
export const MIN_MPESA_WITHDRAWAL_KES = 10
export const MAX_MONEY_INPUT_KES = 100_000_000
export const PAYMENT_GATEWAY_FEE_ESTIMATE_RATE = 0.02

const CLOUD9_PAYOUT_FEE_BRACKETS = [
  [100, 0], [500, 12], [1_000, 12], [1_500, 16], [2_500, 24],
  [3_500, 26], [5_000, 32], [7_500, 32], [10_000, 36], [15_000, 36],
  [20_000, 42], [25_000, 42], [30_000, 44], [35_000, 44], [40_000, 44],
  [50_000, 46], [70_000, 46], [150_000, 46], [250_000, 46],
] as const

export function sanitizeKesAmountInput(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (!digits) {
    return ''
  }
  return BigInt(digits) > BigInt(MAX_MONEY_INPUT_KES) ? String(MAX_MONEY_INPUT_KES) : digits
}

export function formatKesAmountInput(value: string) {
  if (!value) {
    return ''
  }
  return new Intl.NumberFormat('en-US').format(Number.parseInt(value || '0', 10))
}

export function formatKesMoney(value: number | string | null | undefined) {
  const amount = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  return `Ksh ${new Intl.NumberFormat('en-KE', {
    maximumFractionDigits: 0,
  }).format(Math.floor(safeAmount))}`
}

export function estimatePaymentGatewayFeeKes(amountKes: number) {
  if (!Number.isFinite(amountKes) || amountKes <= 0) {
    return 0
  }
  return Math.round(amountKes * PAYMENT_GATEWAY_FEE_ESTIMATE_RATE * 100) / 100
}

export function calculateEstimatedNetDepositKes(amountKes: number) {
  return Math.max(0, Math.floor(amountKes))
}

export function estimateWithdrawalProviderFeeKes(amountKes: number) {
  if (!Number.isFinite(amountKes) || amountKes <= 0) return 0
  const gross = Math.floor(amountKes)
  return CLOUD9_PAYOUT_FEE_BRACKETS.find(([upper]) => gross <= upper)?.[1] ?? 46
}

export function estimateWithdrawalPlatformFeeKes(amountKes: number) {
  if (!Number.isFinite(amountKes) || amountKes <= 2_500) return 0
  return Math.floor(amountKes * 0.01)
}

export function quoteWithdrawalKes(amountKes: number) {
  const gross = Math.max(0, Math.floor(amountKes || 0))
  const providerFee = estimateWithdrawalProviderFeeKes(gross)
  const platformFee = estimateWithdrawalPlatformFeeKes(gross)
  return {
    gross,
    providerFee,
    platformFee,
    recipientAmount: Math.max(0, gross - providerFee - platformFee),
  }
}

export function calculateMaximumWithdrawalRecipientKes(balanceKes: number) {
  if (!Number.isFinite(balanceKes)) return 0
  return Math.max(0, Math.min(Math.floor(balanceKes), MAX_MPESA_DEPOSIT_KES))
}
