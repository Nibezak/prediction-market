import Decimal from 'decimal.js'

export type MoneyCurrency = 'KES' | 'USD' | 'USDC'

function decimalPlaces(currency: MoneyCurrency) {
  return currency === 'KES' ? 0 : 2
}

function parseMoney(value: Decimal.Value) {
  try {
    const amount = new Decimal(value ?? 0)
    if (!amount.isFinite()) {
      return new Decimal(0)
    }
    return amount
  }
  catch {
    return new Decimal(0)
  }
}

export function truncateMoney(value: Decimal.Value, currency: MoneyCurrency) {
  return parseMoney(value).toDecimalPlaces(decimalPlaces(currency), Decimal.ROUND_DOWN)
}

export function roundMoneyUp(value: Decimal.Value, currency: MoneyCurrency) {
  return parseMoney(value).toDecimalPlaces(decimalPlaces(currency), Decimal.ROUND_UP)
}

export function splitUserCredit(value: Decimal.Value, currency: MoneyCurrency) {
  const gross = parseMoney(value)
  const amount = truncateMoney(gross, currency)
  return { gross, amount, commission: gross.sub(amount) }
}

export function splitUserDebit(value: Decimal.Value, currency: MoneyCurrency) {
  const gross = parseMoney(value)
  const amount = roundMoneyUp(gross, currency)
  return { gross, amount, commission: amount.sub(gross) }
}

export function addMoneyValues(...values: Decimal.Value[]) {
  return values.reduce<Decimal>((total, value) => total.add(parseMoney(value)), new Decimal(0))
}
