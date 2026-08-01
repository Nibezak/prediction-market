export const MIN_MPESA_DEPOSIT_KES = 150
export const MAX_MPESA_DEPOSIT_KES = 250_000
export const MIN_MPESA_WITHDRAWAL_KES = 10
export const MINISEND_MPESA_FEE_RATE = 0.01

export function sanitizeKesAmountInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  const whole = parts[0] ?? ''
  const cents = parts.slice(1).join('').slice(0, 2)
  return cents.length > 0 ? `${whole}.${cents}` : whole
}

export function formatKesAmountInput(value: string) {
  if (!value) return ''
  const hasDecimalPoint = value.includes('.')
  const [wholePart = '', fractionPart = ''] = value.split('.')
  const formattedWhole = new Intl.NumberFormat('en-US').format(Number.parseInt(wholePart || '0', 10))
  if (!hasDecimalPoint) return formattedWhole
  if (value.endsWith('.') && !fractionPart) return `${formattedWhole}.`
  return `${formattedWhole}.${fractionPart}`
}

export function formatKesMoney(value: number | string | null | undefined) {
  const amount = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  return `Ksh ${new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount)}`
}

export function calculateMinisendFeeKes(amountKes: number) {
  if (!Number.isFinite(amountKes) || amountKes <= 0) return 0
  return Math.round(amountKes * MINISEND_MPESA_FEE_RATE * 100) / 100
}

export function calculateNetDepositKes(amountKes: number) {
  return Math.max(0, amountKes - calculateMinisendFeeKes(amountKes))
}
