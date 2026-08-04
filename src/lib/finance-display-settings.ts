import { SettingsRepository } from '@/lib/db/queries/settings'

export const FINANCE_SETTINGS_GROUP = 'finance'
export const KES_PER_USD_KEY = 'kes_per_usd'
export const DEFAULT_KES_PER_USD = 130
export const MINIMUM_TRADE_USD = 1

export async function loadKesPerUsdRate() {
  const { data } = await SettingsRepository.getSettings()
  const configured = Number(data?.[FINANCE_SETTINGS_GROUP]?.[KES_PER_USD_KEY]?.value)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_KES_PER_USD
}
